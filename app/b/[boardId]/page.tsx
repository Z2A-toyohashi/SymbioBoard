'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import type { Board, Post } from '@/types';
import { getUserId } from '@/lib/user';
import { supabase } from '@/lib/supabase-client';
import { randomDelay } from '@/lib/utils';
import PostItem from '@/components/PostItem';
import PostInput from '@/components/PostInput';
import SiteHeader from '@/components/SiteHeader';
import AIMeter from '@/components/AIMeter';

export default function BoardPage() {
  const params = useParams<{ boardId: string }>();
  const boardId = params.boardId;

  const [board, setBoard] = useState<Board | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [aiNames, setAiNames] = useState<Record<string, string>>({});
  const [userId, setUserId] = useState('');
  const [replyTo, setReplyTo] = useState<string | undefined>();
  const [replyToPost, setReplyToPost] = useState<Post | undefined>();
  const [loading, setLoading] = useState(true);

  const fetchPosts = useCallback(async () => {
    try {
      const res = await fetch(`/api/posts?boardId=${encodeURIComponent(boardId)}`);
      const data = await res.json();
      if (data.posts) setPosts(data.posts);
    } catch (error) {
      console.error('Failed to fetch posts:', error);
    }
  }, [boardId]);

  useEffect(() => {
    const id = getUserId();
    setUserId(id);

    const init = async () => {
      await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id }),
      }).catch(() => {});

      const [boardRes, charRes] = await Promise.all([
        fetch(`/api/boards/${boardId}`),
        fetch('/api/ai-characters'),
      ]);

      if (boardRes.ok) {
        const data = await boardRes.json();
        setBoard(data.board);
      }
      if (charRes.ok) {
        const data = await charRes.json();
        const map: Record<string, string> = {};
        for (const c of data.characters || []) map[c.id] = c.name;
        setAiNames(map);
      }

      await fetchPosts();
      setLoading(false);
    };

    init();

    const subscription = supabase
      .channel(`posts-${boardId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => {
        fetchPosts();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [boardId, fetchPosts]);

  // AIの様子をうかがう。投稿が0件でも回すので、誰も書いていない板にAIが口火を切れる。
  useEffect(() => {
    if (loading) return;
    const timer = setInterval(() => checkAIIntervention(), 30000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, loading, boardId]);

  const handlePost = async (
    content: string,
    mediaUrl?: string,
    type: 'text' | 'voice' | 'image' = 'text'
  ) => {
    await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });

    const post: Post = {
      id: `${Date.now()}-${Math.random()}`,
      content,
      type,
      created_at: Date.now(),
      thread_id: replyTo || null,
      author_type: 'user',
      author_id: userId,
      media_url: mediaUrl || null,
      board_id: boardId,
    };

    try {
      await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(post),
      });
      await fetchPosts();
      setReplyTo(undefined);
      setReplyToPost(undefined);
    } catch (error) {
      console.error('Failed to post:', error);
    }
  };

  const handleReply = (postId: string) => {
    const clicked = posts.find((p) => p.id === postId);
    if (!clicked) return;
    const rootId = clicked.thread_id || clicked.id;
    const rootPost = clicked.thread_id ? posts.find((p) => p.id === clicked.thread_id) : clicked;
    setReplyTo(rootId);
    setReplyToPost(rootPost);
  };

  const checkAIIntervention = async () => {
    try {
      const res = await fetch('/api/ai-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posts, boardId }),
      });
      const data = await res.json();
      if (!data.shouldPost) return;

      await randomDelay(5, 20);

      const aiUserId = data.ai_id;
      await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: aiUserId }),
      });

      const aiPost: Post = {
        id: `ai-${Date.now()}-${Math.random()}`,
        content: data.content,
        type: data.media_url ? 'image' : 'text',
        created_at: Date.now(),
        thread_id: data.thread_id || null,
        author_type: 'ai',
        author_id: aiUserId,
        media_url: data.media_url || null,
        board_id: boardId,
      };

      await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(aiPost),
      });
      await fetchPosts();
    } catch (error) {
      console.error('AI check failed:', error);
    }
  };

  const topLevelPosts = posts.filter((p) => !p.thread_id);
  const getReplies = (threadId: string) =>
    posts.filter((p) => p.thread_id === threadId).sort((a, b) => a.created_at - b.created_at);

  return (
    <div className="min-h-screen">
      <SiteHeader userId={userId} boardTitle={board?.title || '…'} backHref="/" />
      <AIMeter posts={posts} />

      <main className="max-w-5xl mx-auto px-0 sm:px-4 py-0 sm:py-3 pb-32">
        {board?.description && (
          <p className="px-3 sm:px-0 py-2 text-[12px] mz-ink-sub">{board.description}</p>
        )}

        {loading ? (
          <div className="py-20 text-center mz-ink-faint text-sm">読み込み中…</div>
        ) : topLevelPosts.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <p className="mz-ink-sub text-sm mb-1">まだ誰も書いていません</p>
            <p className="mz-ink-faint text-[12px]">
              あなたが最初の1人になるか、AIが口火を切るのを待つこともできます
            </p>
          </div>
        ) : (
          <div className="rounded-none sm:rounded border-y sm:border mz-border-strong overflow-hidden">
            {/* 2ちゃんねる同様、古い書き込みが上。スレが伸びるほど下に積まれる */}
            {[...topLevelPosts]
              .sort((a, b) => a.created_at - b.created_at)
              .map((post, i) => (
                <PostItem
                  key={post.id}
                  post={post}
                  index={i + 1}
                  replies={getReplies(post.id)}
                  onReply={handleReply}
                  currentUserId={userId}
                  aiNames={aiNames}
                  onReactionUpdate={fetchPosts}
                  onDelete={async (postId) => {
                    try {
                      await fetch(`/api/posts?id=${postId}`, { method: 'DELETE' });
                      await fetchPosts();
                    } catch (error) {
                      console.error('Failed to delete post:', error);
                    }
                  }}
                />
              ))}
          </div>
        )}
      </main>

      <PostInput
        onPost={handlePost}
        replyTo={replyTo}
        replyToPost={replyToPost}
        onCancel={() => {
          setReplyTo(undefined);
          setReplyToPost(undefined);
        }}
        aiNames={aiNames}
      />
    </div>
  );
}
