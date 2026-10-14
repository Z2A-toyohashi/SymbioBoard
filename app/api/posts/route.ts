import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';
import type { Post } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const boardId = new URL(request.url).searchParams.get('boardId');

    let query = supabase.from('posts').select('*');
    if (boardId) {
      query = query.eq('board_id', boardId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ posts: data || [] });
  } catch (error) {
    console.error('Failed to fetch posts:', error);
    return NextResponse.json({ posts: [] }, { status: 500 });
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

    // ログを記録
    await supabase.from('logs').insert([{
      event_type: post.thread_id ? 'reply' : 'post',
      user_id: post.author_id,
      post_id: post.id,
      metadata: { author_type: post.author_type, type: post.type },
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

    if (!postId) {
      return NextResponse.json({ error: 'Post ID required' }, { status: 400 });
    }

    // 投稿を削除（返信も一緒に削除される場合はカスケード設定が必要）
    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId);

    if (error) throw error;

    // ログを記録
    await supabase.from('logs').insert([{
      event_type: 'post',
      user_id: 'system',
      post_id: postId,
      metadata: { action: 'delete' },
      created_at: Date.now(),
    }]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete post:', error);
    return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 });
  }
}
