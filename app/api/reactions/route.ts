import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';
import { isDefaultStamp } from '@/lib/stamps';

type Grouped = Record<string, { count: number; users: Array<{ id: string }> }>;

/**
 * 押された跡を読む。
 *
 * boardId で板ごとにまとめて取る。
 * 以前はレス1件ごとに呼んでいたので、24レスの板では24回の問い合わせが走り、
 * 更新のたびに全部やり直していた。画像のスタンプが乗ると目に見えて遅れる。
 *
 * postId を渡す形も残してある（1件だけ取り直したいとき用）。
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const postId = searchParams.get('postId');
    const boardId = searchParams.get('boardId');

    if (!postId && !boardId) {
      return NextResponse.json({ error: 'postId か boardId が要ります' }, { status: 400 });
    }

    /**
     * 返すのは押した人のIDだけで、それが人かAIかは返さない。
     * IDは人もAIも同じ4桁の数字なので、IDを出しても書き手の正体は割れない。
     * 逆に、ここで人かAIかの印を付けて返すと、画面に出さなくても
     * 通信を覗けば分かってしまう。だから最初から持たせない。
     */
    if (postId) {
      const { data, error } = await supabase
        .from('reactions')
        .select('emoji, user_id')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const grouped: Grouped = {};
      for (const row of (data || []) as Array<{ emoji: string; user_id: string }>) {
        if (!grouped[row.emoji]) grouped[row.emoji] = { count: 0, users: [] };
        grouped[row.emoji].count++;
        grouped[row.emoji].users.push({ id: row.user_id });
      }

      return NextResponse.json({ reactions: grouped });
    }

    // 板ぶんをまとめて。posts との関係をたどって絞る
    const { data, error } = await supabase
      .from('reactions')
      .select('post_id, emoji, user_id, posts!inner(board_id)')
      .eq('posts.board_id', boardId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const byPost: Record<string, Grouped> = {};
    for (const row of (data || []) as Array<{ post_id: string; emoji: string; user_id: string }>) {
      if (!byPost[row.post_id]) byPost[row.post_id] = {};
      const grouped = byPost[row.post_id];
      if (!grouped[row.emoji]) grouped[row.emoji] = { count: 0, users: [] };
      grouped[row.emoji].count++;
      grouped[row.emoji].users.push({ id: row.user_id });
    }

    return NextResponse.json({ byPost });
  } catch (error) {
    console.error('Failed to fetch reactions:', error);
    return NextResponse.json({ error: 'Failed to fetch reactions' }, { status: 500 });
  }
}

/**
 * 押す／取り消す。
 *
 * 押したときに、そのスタンプを持ち物へ入れる。
 * スタンプが増える道をこれ一本にしているので、
 * 「誰かが使ったものを自分も押す」と、次からは別の板でも使える。
 */
export async function POST(request: NextRequest) {
  try {
    const { postId, userId, emoji } = await request.json();

    if (!postId || !userId || !emoji) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from('reactions')
      .select('*')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .eq('emoji', emoji)
      .single();

    if (existing) {
      // 既に押してあるなら取り消す。持ち物からは減らさない（一度覚えたものは残る）
      await supabase
        .from('reactions')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userId)
        .eq('emoji', emoji);

      return NextResponse.json({ success: true, action: 'removed' });
    }

    // 止められたスタンプは新しく押せない。既に押してある跡はそのまま残る
    if (!isDefaultStamp(emoji)) {
      const { data: stamp } = await supabase
        .from('stamps')
        .select('id, disabled')
        .eq('id', emoji)
        .single();

      if (stamp?.disabled) {
        return NextResponse.json({ error: 'このスタンプは止まっています' }, { status: 403 });
      }
    }

    const now = Date.now();
    const { error } = await supabase
      .from('reactions')
      .insert([{ post_id: postId, user_id: userId, emoji, created_at: now }]);

    if (error) throw error;

    await rememberStamp(userId, emoji, now);

    return NextResponse.json({ success: true, action: 'added' });
  } catch (error) {
    console.error('Failed to toggle reaction:', error);
    return NextResponse.json({ error: 'Failed to toggle reaction' }, { status: 500 });
  }
}

/**
 * 押したスタンプを持ち物に入れる。
 *
 * 既に持っていれば、使った回数と最後に使った時刻だけ更新する。
 * 並び順（よく使う順）がこの2つで決まる。
 */
async function rememberStamp(userId: string, stampId: string, now: number): Promise<void> {
  try {
    const { data: owned } = await supabase
      .from('user_stamps')
      .select('use_count')
      .eq('user_id', userId)
      .eq('stamp_id', stampId)
      .single();

    if (owned) {
      await supabase
        .from('user_stamps')
        .update({ use_count: (owned.use_count as number) + 1, last_used_at: now })
        .eq('user_id', userId)
        .eq('stamp_id', stampId);
      return;
    }

    await supabase
      .from('user_stamps')
      .insert([{ user_id: userId, stamp_id: stampId, acquired_at: now, use_count: 1, last_used_at: now }]);
  } catch (error) {
    // 持ち物に入らなくても、押したこと自体は成立している。黙って続ける
    console.error('Failed to remember stamp:', error);
  }
}
