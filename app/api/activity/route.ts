import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';

/**
 * 人の行動を1件受け取って logs に残す。
 *
 * 受け口をこの1本にまとめてある。行動の種類ごとにAPIを作ると、
 * 新しい操作を足すたびに記録を忘れるため。
 *
 * 決めごとが3つある。
 *
 *   1. **logs.post_id の列には入れない。**
 *      あの列は posts を参照していて、消された書き込みを指すと外部キー違反で
 *      記録そのものが落ちる（「自分の書き込みを消した」の記録が一番落ちやすい）。
 *      さらに ON DELETE CASCADE が付いているので、書き込みが消えると
 *      過去の行動まで一緒に消える。分析用の記録がそれでは困るので、
 *      ここでは metadata の中に post_id として持つ
 *
 *   2. **users の行を先に用意する。**
 *      logs.user_id は users を参照している。板一覧を開いた瞬間の記録は
 *      IDの登録と競争になるので、無ければここで作る
 *
 *   3. **知らない種類は受けない。**
 *      誰でも叩ける口なので、好きな名前で行を増やされないようにする
 */

/** 受ける行動の種類。画面側（lib/activity.ts）と対になっている */
const ALLOWED = new Set([
  'view_boards',
  'view_board',
  'leave_board',
  'open_thread_tail',
  'reaction_add',
  'reaction_remove',
  'guess',
  'favorite_add',
  'favorite_remove',
  'board_create',
  'board_close',
  'stamp_create',
  'post_delete',
  'reply_open',
]);

/** metadata に入れる細かい事情の上限。長い本文を丸ごと保存させない */
const DETAIL_MAX_KEYS = 12;
const DETAIL_VALUE_MAX = 500;

async function ensureUserRow(userId: string): Promise<void> {
  const { data } = await supabase.from('users').select('id').eq('id', userId).maybeSingle();
  if (data) return;

  const now = Date.now();
  await supabase.from('users').insert([{ id: userId, created_at: now, last_seen: now }]);
}

/** 画面から来た detail を、入れていい形に削る */
function sanitize(detail: unknown): Record<string, unknown> {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return {};

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail as Record<string, unknown>)) {
    if (Object.keys(out).length >= DETAIL_MAX_KEYS) break;
    if (typeof value === 'string') out[key] = value.slice(0, DETAIL_VALUE_MAX);
    else if (typeof value === 'number' || typeof value === 'boolean') out[key] = value;
    else if (value === null) out[key] = null;
    // 入れ子は落とす。分析のときに形が揃っていないと数えられない
  }
  return out;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const event = String(body.event || '');
    const userId = String(body.userId || '').trim();

    if (!event || !userId) {
      return NextResponse.json({ error: 'event と userId が要ります' }, { status: 400 });
    }
    if (!ALLOWED.has(event)) {
      return NextResponse.json({ error: `知らない行動です: ${event}` }, { status: 400 });
    }

    await ensureUserRow(userId);

    const metadata: Record<string, unknown> = sanitize(body.detail);
    if (body.boardId) metadata.board_id = String(body.boardId).slice(0, 64);
    if (body.postId) metadata.post_id = String(body.postId).slice(0, 128);

    const { error } = await supabase.from('logs').insert([
      {
        event_type: event,
        user_id: userId,
        post_id: null,
        metadata,
        created_at: Date.now(),
      },
    ]);

    if (error) throw error;

    // 来ているあいだは「居る」ので、最終アクセス時刻も一緒に進める。
    // これまでは板を開いた時だけ更新していたので、長く読んでいる人が
    // 「いる人」から外れていた
    await supabase.from('users').update({ last_seen: Date.now() }).eq('id', userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to record activity:', error);
    return NextResponse.json({ error: 'Failed to record activity' }, { status: 500 });
  }
}
