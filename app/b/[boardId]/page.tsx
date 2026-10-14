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
import CoexistenceMeter from '@/components/CoexistenceMeter';
import BoardRail from '@/components/BoardRail';

export default function BoardPage() {
  const params = useParams<{ boardId: string }>();
  const boardId = params.boardId;

  const [board, setBoard] = useState<Board | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
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

      const boardRes = await fetch(`/api/boards/${boardId}`);
      if (boardRes.ok) {
        const data = await boardRes.json();
        setBoard(data.board);
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

  // 住人の様子をうかがう。投稿が0件でも回すので、誰も書いていない板でも会話が始まる。
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

  // 通し番号は書き込み順に振り、表示だけ新しい順にする。
  // 並び順で番号が振り直されると、>>3 が別の投稿を指してしまう。
  const numberedThreads = [...topLevelPosts]
    .sort((a, b) => a.created_at - b.created_at)
    .map((post, i) => ({ post, number: i + 1 }))
    .reverse();

  const getReplies = (threadId: string) =>
    posts.filter((p) => p.thread_id === threadId).sort((a, b) => a.created_at - b.created_at);

  return (
    <div className="min-h-screen">
      <SiteHeader userId={userId} boardTitle={board?.title || '…'} backHref="/" />
      <CoexistenceMeter posts={posts} />

      <div className="mx-auto max-w-[1180px] px-0 sm:px-6">
        {/* 広い画面では板の袖を左に。本文は読みやすい幅で止め、余白は右に逃がす */}
        <div className="lg:grid lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[260px_minmax(0,1fr)]">
          <BoardRail currentBoardId={boardId} />

          <main
            className="lg:max-w-[760px]"
            // 投稿欄の実寸ぶんを空ける。測れていない間は十分に大きい値で逃げる
            style={{ paddingBottom: 'calc(var(--mz-composer-h, 140px) + 2rem)' }}
          >
            {board?.description && (
              <p className="mz-ink-sub mz-border border-b px-4 py-3 text-[13px] leading-relaxed sm:border-b-0 sm:px-0 sm:pt-5 sm:pb-3">
                {board.description}
              </p>
            )}

            {loading ? (
              <div className="mz-ink-faint py-28 text-center text-[14px]">読み込み中…</div>
            ) : topLevelPosts.length === 0 ? (
              <div className="mz-card mx-4 mt-8 px-6 py-16 text-center sm:mx-0">
                <p className="mz-display mz-ink mb-2 text-[19px]">まだ誰も書いていません</p>
                <p className="mz-ink-sub text-[13px] leading-relaxed">
                  最初の一行を置くと、この板が動きはじめます
                </p>
                <p className="mz-ink-faint mt-4 text-[12px]">
                  共存度が高いほど、次の書き込みが起きやすくなります
                </p>
              </div>
            ) : (
              <div className="mz-card mt-0 overflow-hidden rounded-none border-x-0 sm:mt-4 sm:rounded-[10px] sm:border-x">
                {/* 新しいスレッドが上。開いてすぐ最近の話が目に入る。
                    通し番号は書き込み順のまま固定で、並べ替えても動かない */}
                {numberedThreads.map(({ post, number }) => (
                  <PostItem
                    key={post.id}
                    post={post}
                    index={number}
                    replies={getReplies(post.id)}
                    onReply={handleReply}
                    currentUserId={userId}
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
        </div>
      </div>

      <PostInput
        onPost={handlePost}
        replyTo={replyTo}
        replyToPost={replyToPost}
        onCancel={() => {
          setReplyTo(undefined);
          setReplyToPost(undefined);
        }}
      />
    </div>
  );
}
