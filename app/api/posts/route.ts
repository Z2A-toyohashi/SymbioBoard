import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';
import { canRevealCoexistence } from '@/lib/coexistence';
import type { Post } from '@/types';

/**
 * 板の書き込みを読む。
 *
 * **author_type（人かAIか）は返さない。**
 *
 * 以前ここは select('*') をそのまま返していたので、応答に author_type が
 * 乗っていた。画面には出していなかったが、
 *
 *     curl '/api/posts?boardId=...'
 *
 * と叩けば、どのレスがAIかを全部読めた。開発者ツールの通信欄でも同じ。
 * 「どれが人でどれがAIか分からない」のはこのアプリの中身そのもので、
 * 画面に出さないことと通信に乗せないことは、同じ一つの約束の両面になる。
 *
 * 共存度（人とAIがどれだけ釣り合っているか）は数字としてなら出してよいが、
 * 板が小さいうちは件数からも正体が割れる。
 * 「自分の1件を引けば、残りはAI」が成り立ってしまうため。
 * 出していいかどうかは lib/coexistence.ts が決め、出せないうちは
 * counts を null で返す（画面では「？」になる）。
 * 隠すと決めたものは最初から送らない。送ってから隠しても、覗けば分かる。
 *
 * 管理画面だけは author_type が要る（どの住人が何を書いたかを追うため）。
 * admin=1 のときだけ付けて返す。
 * ※ 管理画面には認証が無い（既知の弱点）。公開する前に鍵を付けること。
 */
export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const boardId = params.get('boardId');
    const isAdmin = params.get('admin') === '1';
    // 内訳を出していいかは「自分以外の人が何件書いたか」で決まる
    const userId = params.get('userId');

    let query = supabase.from('posts').select('*');
    if (boardId) {
      query = query.eq('board_id', boardId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    const rows = (data || []) as Post[];
    const aiCount = rows.filter((p) => p.author_type === 'ai').length;
    const humanCount = rows.length - aiCount;
    const othersHumanCount = rows.filter(
      (p) => p.author_type !== 'ai' && p.author_id !== userId
    ).length;

    const revealed = isAdmin || canRevealCoexistence(othersHumanCount, aiCount);

    return NextResponse.json({
      posts: isAdmin
        ? rows
        : // 印を落として渡す。列を1つ外すだけだが、ここがこの約束の要になる
          rows.map((row) => {
            const copy: Partial<Post> = { ...row };
            delete copy.author_type;
            return copy;
          }),
      counts: revealed ? { human: humanCount, ai: aiCount } : null,
      revealed,
    });
  } catch (error) {
    console.error('Failed to fetch posts:', error);
    return NextResponse.json({ posts: [], counts: null, revealed: false }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const post: Post = await request.json();

    // ユーザーが存在しない場合は自動作成
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('id', post.author_id)
      .single();

    if (!existingUser) {
      await supabase
        .from('users')
        .insert([{
          id: post.author_id,
          created_at: Date.now(),
          last_seen: Date.now(),
        }]);
    } else {
      // 最終アクセス時刻を更新
      await supabase
        .from('users')
        .update({ last_seen: Date.now() })
        .eq('id', post.author_id);
    }

    const { data, error } = await supabase
      .from('posts')
      .insert([post])
      .select()
      .single();

    if (error) throw error;

    // ログを記録。板も一緒に残す（どの板で書かれたかが後から要る）
    await supabase.from('logs').insert([{
      event_type: post.thread_id ? 'reply' : 'post',
      user_id: post.author_id,
      post_id: post.id,
      metadata: {
        author_type: post.author_type,
        type: post.type,
        board_id: post.board_id,
        content: post.content?.slice(0, 500),
        reply_to: post.thread_id,
      },
      created_at: Date.now(),
    }]);

    return NextResponse.json({ success: true, post: data });
  } catch (error) {
    console.error('Failed to create post:', error);
    return NextResponse.json({ error: 'Failed to create post' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const postId = searchParams.get('id');
    // 消した人。管理画面からの削除では付かない
    const userId = searchParams.get('userId');

    if (!postId) {
      return NextResponse.json({ error: 'Post ID required' }, { status: 400 });
    }

    // 投稿を削除（返信も一緒に削除される場合はカスケード設定が必要）
    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId);

    if (error) throw error;

    /**
     * 消したことの記録。
     *
     * post_id の列には入れない。あの列は posts を参照しているので、
     * いま消した書き込みを指すと外部キー違反になって記録自体が残らない。
     * 消された書き込みのIDは metadata に持つ。
     *
     * 誰が消したか分からないときは記録しない。logs.user_id は users を
     * 参照しているので、'system' のような実在しないIDを入れると
     * 外部キー違反で行が入らず、入ったつもりの記録だけが残る。
     */
    if (userId) {
      await supabase.from('logs').insert([
        {
          event_type: 'post_delete',
          user_id: userId,
          post_id: null,
          metadata: { post_id: postId },
          created_at: Date.now(),
        },
      ]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete post:', error);
    return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 });
  }
}
