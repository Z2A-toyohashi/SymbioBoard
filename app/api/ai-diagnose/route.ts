import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabase } from '@/lib/supabase-client';

/**
 * AIが書き込まない理由を切り分けるための点検。
 *
 * 生成に失敗したときに相槌でごまかす挙動をやめたので、
 * 不具合は「AIが黙る」という形でしか現れなくなった。静かなのが
 * 設定通りなのか、鍵が無いのか、マイグレーション漏れなのかを
 * 画面から判別できないと、原因がどこまでも推測になる。
 *
 * ここでは書き込みを発生させず、必要な事実だけを集めて返す。
 * APIキーそのものは返さない。
 */
export async function GET() {
  const checks: Record<string, unknown> = {};

  // 1. OpenAIの鍵があるか、実際に通るか
  const key = process.env.OPENAI_API_KEY;
  checks.openai_key = key
    ? { present: true, length: key.length, prefix: key.slice(0, 7) }
    : { present: false };

  if (key) {
    try {
      const openai = new OpenAI({ apiKey: key });
      const res = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'テストです。「ok」とだけ返してください。' }],
      });
      checks.openai_call = {
        ok: true,
        sample: res.choices[0]?.message?.content?.trim() ?? '(空の応答)',
      };
    } catch (error) {
      checks.openai_call = {
        ok: false,
        message: error instanceof Error ? error.message : 'unknown',
      };
    }
  } else {
    checks.openai_call = { ok: false, message: 'OPENAI_API_KEY が設定されていません' };
  }

  // 2. 住人がいるか、クールダウンが明けているか
  const { data: characters, error: charError } = await supabase
    .from('ai_characters')
    .select('id, name, last_post_time, post_frequency');

  if (charError) {
    checks.ai_characters = { ok: false, message: charError.message };
  } else {
    const now = Date.now();
    checks.ai_characters = {
      ok: true,
      count: characters?.length || 0,
      recent_posts: (characters || [])
        .map((c) => ({
          name: c.name as string,
          last_post_minutes_ago: c.last_post_time
            ? Math.round((now - (c.last_post_time as number)) / 60000)
            : null,
        }))
        .sort((a, b) => (a.last_post_minutes_ago ?? 1e9) - (b.last_post_minutes_ago ?? 1e9))
        .slice(0, 10),
    };
  }

  // 3. 設定値。確率が全部0なら、正常に黙っているだけ
  const { data: settings, error: settingsError } = await supabase
    .from('ai_settings')
    .select('*')
    .eq('id', 'default')
    .single();

  if (settingsError || !settings) {
    checks.ai_settings = { ok: false, message: settingsError?.message || '行がありません' };
  } else {
    checks.ai_settings = {
      ok: true,
      probabilities: {
        にぎやか: settings.prob_flow,
        しずか: settings.prob_silence,
        ゆらぎ: settings.prob_fragile,
        ひとりごと: settings.prob_solo,
      },
      max_ai_density: settings.max_ai_density,
      max_response_length: settings.max_response_length,
      cooldown_minutes: [
        Math.round(settings.cooldown_min / 60000),
        Math.round(settings.cooldown_max / 60000),
      ],
      common_prompt_length: (settings.system_prompt || '').length,
      // 第2次マイグレーションが入っているか
      migration_002_applied: 'ai_auto_populate' in settings,
    };
  }

  // 4. 板の列があるか。無いと書き込み自体が失敗する
  const { error: boardColError } = await supabase.from('posts').select('board_id').limit(1);
  checks.posts_board_id = boardColError
    ? { ok: false, message: boardColError.message }
    : { ok: true };

  // 5. 板ごとの自立発言まわり。migration-004 が入っているか、
  //    今日の枠を使い切っていないか、次に様子を見るのはいつか
  const now = Date.now();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { count: todayCount } = await supabase
    .from('logs')
    .select('id', { count: 'exact', head: true })
    .eq('event_type', 'ai_intervention')
    .gte('created_at', startOfDay.getTime());

  const { data: states, error: stateError } = await supabase
    .from('board_ai_state')
    .select('board_id, next_due_at, last_ai_post_at, last_check_at')
    .order('next_due_at');

  if (stateError) {
    checks.board_autonomy = {
      ok: false,
      message: `board_ai_state を読めません（${stateError.message}）。migration-004-ai-autonomy.sql を実行してください。`,
    };
  } else {
    const budget = (settings?.ai_daily_budget as number | undefined) ?? null;
    checks.board_autonomy = {
      ok: true,
      daily_budget: budget,
      used_today: todayCount || 0,
      budget_left: budget === null ? null : Math.max(0, budget - (todayCount || 0)),
      // 行が0件なら、テーブルはあるがRLSで読めていない可能性がある
      rows_visible: (states || []).length,
      boards: (states || []).slice(0, 10).map((s) => ({
        board_id: s.board_id as string,
        due_in_minutes: Math.round((((s.next_due_at as number) || 0) - now) / 60000),
        last_check_minutes_ago: s.last_check_at
          ? Math.round((now - (s.last_check_at as number)) / 60000)
          : null,
        last_ai_post_minutes_ago: s.last_ai_post_at
          ? Math.round((now - (s.last_ai_post_at as number)) / 60000)
          : null,
      })),
    };
  }

  // 6. 直近でAIが実際に書いた記録
  const { data: logs } = await supabase
    .from('logs')
    .select('created_at, metadata')
    .eq('event_type', 'ai_intervention')
    .order('created_at', { ascending: false })
    .limit(3);

  checks.recent_ai_logs = (logs || []).map((l) => ({
    minutes_ago: Math.round((Date.now() - (l.created_at as number)) / 60000),
    content: (l.metadata as Record<string, unknown> | null)?.content ?? null,
  }));

  return NextResponse.json(checks);
}
