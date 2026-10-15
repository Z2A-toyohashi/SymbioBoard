import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    const { data, error } = await supabase.from('boards').select('*').eq('id', id).single();

    if (error || !data) {
      return NextResponse.json({ error: 'board not found' }, { status: 404 });
    }

    return NextResponse.json({ board: data });
  } catch (error) {
    console.error('Failed to fetch board:', error);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

/**
 * 板を閉じる（一覧から下げる）。
 *
 * 閉じられるのは、その板を立てた本人だけ。
 * 板は誰でも立てられるので、誰でも閉じられると他人の場を畳めてしまう。
 *
 * 本人かどうかは、立てたときに記録した created_by と、送られてきたIDで見る。
 * IDはブラウザに保存されているだけのもので、なりすまそうと思えばできる。
 * ここは「他人の板を間違って閉じない」ための仕切りであって、
 * 鍵ではない（この場に本人確認の仕組みは無い）。
 *
 * 管理画面からは admin=1 で、立てた人に関わらず閉じられる。
 * admin=1 かつ purge=1 のときだけ、板を本当に消す（下げた板に限る）。
 */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const params = new URL(request.url).searchParams;
    const userId = params.get('userId');
    const isAdmin = params.get('admin') === '1';

    const { data: board } = await supabase
      .from('boards')
      .select('is_default, created_by, archived')
      .eq('id', id)
      .single();

    if (!board) {
      return NextResponse.json({ error: 'board not found' }, { status: 404 });
    }

    if (board.is_default) {
      return NextResponse.json({ error: '既定の板は閉じられません' }, { status: 400 });
    }

    /**
     * 完全に削除。
     *
     * 板の行を消すと、posts も board_ai_state も外部キーで一緒に消える
     * （ON DELETE CASCADE）。書き込みに付いたリアクションも同様。戻せない。
     *
     * 間違いで消えないよう、二重に絞る。
     *   - 管理画面からだけ（admin=1）
     *   - 一度「下げた」板だけ。いま一覧に出ている板はそのままでは消せない
     *
     * アップロード済みの画像はStorageに残る。板と結び付いていないので、
     * ここで消すと他の板に貼られた同じ画像まで巻き込む恐れがある。
     */
    if (params.get('purge') === '1') {
      if (!isAdmin) {
        return NextResponse.json({ error: '完全な削除は管理画面からだけです' }, { status: 403 });
      }
      if (!board.archived) {
        return NextResponse.json(
          { error: '先に「下げる」で一覧から外してください' },
          { status: 400 }
        );
      }

      const { count } = await supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('board_id', id);

      const { error: purgeError } = await supabase.from('boards').delete().eq('id', id);
      if (purgeError) throw purgeError;

      return NextResponse.json({ success: true, purged: true, deletedPosts: count || 0 });
    }

    if (!isAdmin) {
      if (!board.created_by) {
        return NextResponse.json(
          { error: 'この板には立てた人の記録がありません' },
          { status: 403 }
        );
      }
      if (!userId || userId !== board.created_by) {
        return NextResponse.json({ error: '立てた本人だけが閉じられます' }, { status: 403 });
      }
    }

    // 投稿は残したまま一覧から下げる。消すと会話の記録ごと消えてしまうため。
    const { error } = await supabase.from('boards').update({ archived: true }).eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to archive board:', error);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

/**
 * 閉じた板を戻す。
 *
 * 「閉じる」は一覧から下げるだけで、板も書き込みも消していない。
 * 戻せないと、閉じた時点で実質の削除になってしまう。
 * 戻せるのは管理画面から（admin=1）と、立てた本人。
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const params = new URL(request.url).searchParams;
    const userId = params.get('userId');
    const isAdmin = params.get('admin') === '1';

    const { data: board } = await supabase
      .from('boards')
      .select('created_by')
      .eq('id', id)
      .single();

    if (!board) {
      return NextResponse.json({ error: 'board not found' }, { status: 404 });
    }

    if (!isAdmin && (!board.created_by || userId !== board.created_by)) {
      return NextResponse.json({ error: '立てた本人だけが戻せます' }, { status: 403 });
    }

    const { error } = await supabase.from('boards').update({ archived: false }).eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to restore board:', error);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
