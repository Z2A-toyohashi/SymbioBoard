import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';

/**
 * 見立て。「このレスは人だと思う／AIだと思う」。
 *
 * この場の中身は「どれが人でどれがAIか分からない」ことなので、
 * 当てる遊びを足すなら、**答え合わせを一切しない**形でなければならない。
 * ここが崩れると、見分けられないという前提そのものが無くなる。
 *
 * そのために次を守る。
 *
 *   1. **正解を返さない。** 押しても「合っていたか」は返らない。
 *      このAPIは posts.author_type を一度も読まない（読めば漏れる口ができる）
 *   2. **的中率も返さない。** 本人の的中率を返すと、1件ずつ押して
 *      数字の動きを見るだけで、そのレスの正体が逆算できてしまう
 *   3. **レスごとの票数も返さない。** 「このレスは9人中8人が人だと言った」は
 *      正解ではないが、限りなく近い手がかりになる。返すのは板単位の合計だけ
 *
 * つまり返るのは「この板では、見立てのうち何割が人だと言っているか」という
 * 一つの数字と、自分がどう押したかだけ。永久に答えは出ない。
 *
 * 自分の書き込みには押せない（書いた本人には答えが分かっているため）。
 */

/** 台帳がまだ無いとき。画面側はこの印を見て、見立ての操作そのものを出さない */
function unavailable(error: unknown) {
  const detail = error as { message?: string; code?: string } | null;
  const missingTable =
    detail?.code === '42P01' ||
    detail?.code === 'PGRST205' ||
    (detail?.message || '').includes('schema cache');

  if (missingTable) {
    return NextResponse.json({
      available: false,
      reason: '見立ての台帳がまだありません。migration-013-guesses.sql を実行してください',
      board: { human: 0, ai: 0, total: 0, humanRate: null },
      mine: {},
    });
  }

  return null;
}

/**
 * 板の集計と、自分がどう押したか。
 *
 * 集計は板ぜんたいで1組だけ。レスごとには返さない（上の2と3）。
 */
export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const boardId = params.get('boardId');
    const userId = params.get('userId');

    if (!boardId) {
      return NextResponse.json({ error: 'boardId が要ります' }, { status: 400 });
    }

    const [{ data: rows, error }, { data: mineRows }] = await Promise.all([
      supabase.from('guesses').select('guess').eq('board_id', boardId),
      userId
        ? supabase
            .from('guesses')
            .select('post_id, guess')
            .eq('board_id', boardId)
            .eq('user_id', userId)
        : Promise.resolve({ data: [] as Array<{ post_id: string; guess: string }> }),
    ]);

    if (error) {
      const fallback = unavailable(error);
      if (fallback) return fallback;
      throw error;
    }

    const all = (rows || []) as Array<{ guess: string }>;
    const human = all.filter((r) => r.guess === 'human').length;
    const ai = all.length - human;

    const mine: Record<string, 'human' | 'ai'> = {};
    for (const row of (mineRows || []) as Array<{ post_id: string; guess: string }>) {
      mine[row.post_id] = row.guess === 'human' ? 'human' : 'ai';
    }

    return NextResponse.json({
      available: true,
      board: {
        human,
        ai,
        total: all.length,
        /** 見立てのうち「人だと思う」の割合。0件のときは null（0%ではない） */
        humanRate: all.length > 0 ? Math.round((human * 100) / all.length) : null,
      },
      mine,
    });
  } catch (error) {
    console.error('Failed to read guesses:', error);
    return NextResponse.json({ error: 'Failed to read guesses' }, { status: 500 });
  }
}

/**
 * 押す／押し直す。
 *
 * 同じレスに何度押しても、最後の1つだけが残る（UNIQUE(post_id, user_id)）。
 * 返すのは成功したことだけ。合っていたかどうかは返さない。
 */
export async function POST(request: NextRequest) {
  try {
    const { postId, userId, guess } = await request.json();

    if (!postId || !userId || (guess !== 'human' && guess !== 'ai')) {
      return NextResponse.json(
        { error: 'postId と userId、guess（human か ai）が要ります' },
        { status: 400 }
      );
    }

    /**
     * 書き込みそのものを引く。
     *
     * 読むのは author_id と board_id だけ。author_type は読まない。
     * 読んでしまうと、ここから正解を返せる口が開く（返さなくても、
     * 次に手を入れる人が「あるなら使える」と思ってしまう）。
     */
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('author_id, board_id')
      .eq('id', postId)
      .maybeSingle();

    if (postError) throw postError;
    if (!post) {
      return NextResponse.json({ error: 'その書き込みがありません' }, { status: 404 });
    }
    if (post.author_id === userId) {
      // 自分の書き込みには答えが分かっている。数えると集計が濁る
      return NextResponse.json({ error: '自分の書き込みには見立てられません' }, { status: 400 });
    }

    const { error } = await supabase.from('guesses').upsert(
      [
        {
          post_id: postId,
          user_id: userId,
          board_id: post.board_id,
          guess,
          created_at: Date.now(),
        },
      ],
      { onConflict: 'post_id,user_id' }
    );

    if (error) {
      const fallback = unavailable(error);
      if (fallback) return fallback;
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to save guess:', error);
    return NextResponse.json({ error: 'Failed to save guess' }, { status: 500 });
  }
}
