import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';
import { detectSpaceState } from '@/lib/ai-logic';
import type { AIMood, Post } from '@/types';

/**
 * 「ざわめきメーター」のためのエンドポイント。
 *
 * AIが今どれくらい口を挟みそうかを画面に出すために、
 * /api/ai-check と同じ判定を、副作用なし・乱数なしで計算して返す。
 * メーターが乱数で跳ねると読み物にならないので、
 * クールダウンは min/max の中間値を使って安定させている。
 */
export async function POST(request: NextRequest) {
  try {
    const { posts }: { posts: Post[] } = await request.json();

    const [{ data: settings }, { data: characters }] = await Promise.all([
      supabase.from('ai_settings').select('*').eq('id', 'default').single(),
      supabase.from('ai_characters').select('id, last_post_time, post_frequency'),
    ]);

    const config = settings || {
      cooldown_min: 300000,
      cooldown_max: 900000,
      max_ai_density: 0.2,
      prob_flow: 0,
      prob_silence: 0.35,
      prob_fragile: 0.15,
      prob_solo: 0.5,
    };

    const state = detectSpaceState(posts || []);
    const probabilities: Record<string, number> = {
      FLOW: config.prob_flow,
      SILENCE: config.prob_silence,
      FRAGILE: config.prob_fragile,
      SOLO: config.prob_solo,
    };

    const aiPosts = (posts || []).filter((p) => p.author_type === 'ai');
    const density = posts?.length ? aiPosts.length / posts.length : 0;

    const now = Date.now();
    const midCooldown = (config.cooldown_min + config.cooldown_max) / 2;

    let eligible = 0;
    let soonest = Number.POSITIVE_INFINITY;

    for (const ai of characters || []) {
      const adjusted = midCooldown / (ai.post_frequency || 1);
      const elapsed = now - (ai.last_post_time || 0);
      if (elapsed >= adjusted) {
        eligible++;
        soonest = 0;
      } else {
        soonest = Math.min(soonest, adjusted - elapsed);
      }
    }

    const aiCount = characters?.length || 0;

    let blocked: string | null = null;
    if (aiCount === 0) blocked = 'AIがまだ住んでいません';
    else if (density > config.max_ai_density) blocked = 'AIが喋りすぎたので控えています';
    else if (eligible === 0) blocked = '全員クールダウン中';

    const mood: AIMood = {
      state,
      probability: blocked ? 0 : probabilities[state] ?? 0,
      density,
      max_density: config.max_ai_density,
      ai_count: aiCount,
      eligible_count: eligible,
      cooldown_remaining: Number.isFinite(soonest) ? Math.max(0, Math.round(soonest)) : 0,
      blocked_reason: blocked,
    };

    return NextResponse.json(mood);
  } catch (error) {
    console.error('Failed to compute AI mood:', error);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
