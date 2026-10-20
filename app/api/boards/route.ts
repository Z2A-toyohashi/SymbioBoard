import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';
import { displayId } from '@/lib/short-id';
import { canRevealCoexistence, countCoexistenceEvidence } from '@/lib/coexistence';
import { boardGraceMs } from '@/lib/board-grace';
import type { BoardSummary, Participant } from '@/types';

/**
 * 板の一覧と作成。
 * 参加者は専用テーブルを作らず、その板の投稿者から導出する。
 * 「いる」の定義が常に投稿実績と一致し、ズレようがないため。
 */

export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;

    // 管理画面からは閉じた板も要る。
    // 投稿が「どこに書かれたか」を追うとき、閉じた板だけ名前が出ないと行方が分からない。
    const includeArchived = params.get('includeArchived') === '1';

    /**
     * 人かAIかを付けて返すのは、管理画面に答えるときだけ。
     *
     * 以前はここが常に participants[].type = 'ai' を返し、
     * さらにAI住人の名前（管理画面にしか無いはずのもの）まで乗せていた。
     * 板に出ている author_id と突き合わせれば、どのIDが住人かが分かり、
     * そのIDの書き込みはすべてAIだと特定できた。
     *
     * 「どれが人でどれがAIか分からない」のはこのアプリの中身そのものなので、
     * 板の側に渡すものからは、この印を落とす。
     * 人数の内訳（人◯件 / AI◯件）は数字としてなら出してよいので残す。
     *
     * ※ 管理画面には認証が無い（既知の弱点）。公開する前に鍵を付けること。
     */
    const isAdmin = params.get('admin') === '1';

    /**
     * 内訳（人◯件 : AI◯件）を出していいかは板ごとに決める。
     *
     * 立ったばかりの板で内訳を出すと、自分の書き込みを引くだけで
     * 残りがAIだと分かる。判定は lib/coexistence.ts、
     * 出せないうちは件数を null で返す（画面では「？」）。
     */
    const userId = params.get('userId');

    const boardQuery = supabase.from('boards').select('*').order('created_at', { ascending: true });
    if (!includeArchived) boardQuery.eq('archived', false);

    const [{ data: boards }, { data: posts }, { data: aiCharacters }] = await Promise.all([
      boardQuery,
      supabase.from('posts').select('id, board_id, thread_id, author_id, author_type, created_at'),
      supabase.from('ai_characters').select('id, name'),
    ]);

    const aiNames = new Map((aiCharacters || []).map((c) => [c.id, c.name as string]));

    const summaries: BoardSummary[] = (boards || []).map((board) => {
      const boardPosts = (posts || []).filter((p) => p.board_id === board.id);

      const counts = new Map<string, { type: 'user' | 'ai'; count: number }>();
      for (const post of boardPosts) {
        const prev = counts.get(post.author_id);
        counts.set(post.author_id, {
          type: post.author_type === 'ai' ? 'ai' : 'user',
          count: (prev?.count || 0) + 1,
        });
      }

      const participants: Participant[] = Array.from(counts.entries())
        .map(([id, v]) =>
          isAdmin
            ? {
                id,
                type: v.type,
                name: v.type === 'ai' ? aiNames.get(id) || 'AI' : `ID:${displayId(id)}`,
                post_count: v.count,
              }
            : // 板の側へ渡す形。全員が同じ「ID:4桁」で、種別は付かない
              { id, name: `ID:${displayId(id)}`, post_count: v.count }
        )
        .sort((a, b) => b.post_count - a.post_count);

      const aiPostCount = boardPosts.filter((p) => p.author_type === 'ai').length;
      // 件数とID数の両方で見る。IDが少ないと、件数が多くても正体が割れる
      const revealed =
        isAdmin || canRevealCoexistence(countCoexistenceEvidence(boardPosts, userId));

      return {
        ...board,
        thread_count: boardPosts.filter((p) => !p.thread_id).length,
        post_count: boardPosts.length,
        human_post_count: revealed ? boardPosts.length - aiPostCount : null,
        ai_post_count: revealed ? aiPostCount : null,
        last_post_at: boardPosts.length
          ? Math.max(...boardPosts.map((p) => p.created_at as number))
          : null,
        participants,
      };
    });

    // 動きの新しい板が上。まだ書き込みのない板は開設日で見るので、
    // 立てたばかりの板も上に出て、最初の一行を呼び込める。
    summaries.sort(
      (a, b) => (b.last_post_at || b.created_at) - (a.last_post_at || a.created_at)
    );

    return NextResponse.json({ boards: summaries });
  } catch (error) {
    console.error('Failed to fetch boards:', error);
    return NextResponse.json({ boards: [] }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { title, description, userId } = await request.json();

    if (!title || !String(title).trim()) {
      return NextResponse.json({ error: 'タイトルを入力してください' }, { status: 400 });
    }

    const trimmed = String(title).trim().slice(0, 40);
    // 開設時刻は下の board_ai_state でも使うので、一度だけ取る
    const now = Date.now();
    const id = `b${now.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

    const { data, error } = await supabase
      .from('boards')
      .insert([
        {
          id,
          title: trimmed,
          description: description ? String(description).trim().slice(0, 120) : null,
          created_at: now,
          created_by: userId || null,
          is_default: false,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    /**
     * 立てた直後は、住人が来ないようにする。
     *
     * 板を立てて最初の一行を書いた数秒後に返事が来ると、
     * その相手は人ではありえない（人は、できたばかりの板を
     * 数秒で見つけて書き込んだりしない）。それだけで分かってしまう。
     *
     * 次に見にいく時刻を、間（ま）の明けたあとに置く。
     * 間の長さは板ごとに違う（lib/board-grace.ts）。
     * 揃っていると「開設の何分後に誰かが来る板」という形が印になる。
     *
     * board_ai_state が無いDB（migration-004 未適用）では何も起きないが、
     * lib/ai-speak.ts 側でも板の開設時刻を見て止めている。
     */
    const dueAt = now + boardGraceMs(id);
    const { error: stateError } = await supabase
      .from('board_ai_state')
      .upsert({ board_id: id, next_due_at: dueAt, lease_until: 0 }, { onConflict: 'board_id' });

    if (stateError) {
      console.error('board_ai_state not set for the new board:', stateError.message);
    }

    return NextResponse.json({ board: data });
  } catch (error) {
    console.error('Failed to create board:', error);
    return NextResponse.json({ error: '板を立てられませんでした' }, { status: 500 });
  }
}
