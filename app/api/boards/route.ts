import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';
import type { BoardSummary, Participant } from '@/types';

/**
 * 板の一覧と作成。
 * 参加者は専用テーブルを作らず、その板の投稿者から導出する。
 * 「いる」の定義が常に投稿実績と一致し、ズレようがないため。
 */

export async function GET() {
  try {
    const [{ data: boards }, { data: posts }, { data: aiCharacters }] = await Promise.all([
      supabase.from('boards').select('*').eq('archived', false).order('created_at', { ascending: true }),
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
        .map(([id, v]) => ({
          id,
          type: v.type,
          name: v.type === 'ai' ? aiNames.get(id) || 'AI' : `ID:${id.slice(-4)}`,
          post_count: v.count,
        }))
        .sort((a, b) => b.post_count - a.post_count);

      return {
        ...board,
        thread_count: boardPosts.filter((p) => !p.thread_id).length,
        post_count: boardPosts.length,
        last_post_at: boardPosts.length
          ? Math.max(...boardPosts.map((p) => p.created_at as number))
          : null,
        participants,
      };
    });

    // 動きがある板を上に出す。新しく立った板が埋もれないよう、投稿ゼロは作成順で末尾へ。
    summaries.sort((a, b) => (b.last_post_at || 0) - (a.last_post_at || 0));

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
    const id = `b${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

    const { data, error } = await supabase
      .from('boards')
      .insert([
        {
          id,
          title: trimmed,
          description: description ? String(description).trim().slice(0, 120) : null,
          created_at: Date.now(),
          created_by: userId || null,
          is_default: false,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ board: data });
  } catch (error) {
    console.error('Failed to create board:', error);
    return NextResponse.json({ error: '板を立てられませんでした' }, { status: 500 });
  }
}
