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

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    const { data: board } = await supabase.from('boards').select('is_default').eq('id', id).single();
    if (board?.is_default) {
      return NextResponse.json({ error: '既定の板は閉じられません' }, { status: 400 });
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
