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
 */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const params = new URL(request.url).searchParams;
    const userId = params.get('userId');
    const isAdmin = params.get('admin') === '1';

    const { data: board } = await supabase
      .from('boards')
      .select('is_default, created_by')
      .eq('id', id)
      .single();

    if (!board) {
      return NextResponse.json({ error: 'board not found' }, { status: 404 });
    }

    if (board.is_default) {
      return NextResponse.json({ error: '既定の板は閉じられません' }, { status: 400 });
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
