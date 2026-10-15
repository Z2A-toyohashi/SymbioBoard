import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const postId = searchParams.get('postId');

    if (!postId) {
      return NextResponse.json({ error: 'Post ID required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('reactions')
      .select('*')
      .eq('post_id', postId);

    if (error) throw error;

    // 絵文字ごとにまとめる。
    // 誰がAIかは返さない。板では人もAIも同じ資格で押しているので、
    // 画面に出さないだけでなく、そもそもクライアントに渡さない。
    // （以前は id が 'ai-' で始まるかで判定して isAI を返していたが、
    //   AIのIDを4桁の数字に揃えたのでその判定自体が成り立たない）
    const grouped: Record<string, { count: number; users: Array<{ id: string }> }> = {};
    (data || []).forEach((reaction: { emoji: string; user_id: string }) => {
      if (!grouped[reaction.emoji]) {
        grouped[reaction.emoji] = { count: 0, users: [] };
      }
      grouped[reaction.emoji].count++;
      grouped[reaction.emoji].users.push({ id: reaction.user_id });
    });

    return NextResponse.json({ reactions: grouped });
  } catch (error) {
    console.error('Failed to fetch reactions:', error);
    return NextResponse.json({ error: 'Failed to fetch reactions' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { postId, userId, emoji } = await request.json();

    if (!postId || !userId || !emoji) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 既存のリアクションをチェック
    const { data: existing } = await supabase
      .from('reactions')
      .select('*')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .eq('emoji', emoji)
      .single();

    if (existing) {
      // 既にリアクション済みなら削除（トグル）
      await supabase
        .from('reactions')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userId)
        .eq('emoji', emoji);

      return NextResponse.json({ success: true, action: 'removed' });
    } else {
      // 新規リアクション
      const { error } = await supabase
        .from('reactions')
        .insert([{
          post_id: postId,
          user_id: userId,
          emoji,
          created_at: Date.now(),
        }]);

      if (error) throw error;

      return NextResponse.json({ success: true, action: 'added' });
    }
  } catch (error) {
    console.error('Failed to toggle reaction:', error);
    return NextResponse.json({ error: 'Failed to toggle reaction' }, { status: 500 });
  }
}
