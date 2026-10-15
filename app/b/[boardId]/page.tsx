'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import type { Board, Post } from '@/types';
import { getUserId } from '@/lib/user';
import { supabase } from '@/lib/supabase-client';
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

    /**
     * 書き込みの受信。
     *
     * 接続はこの板の投稿だけに絞る。板をまたいで全件を受けると、
     * 見ていない板の書き込みでも取得が走る。
     *
     * 戻る/進むでページが凍結される（bfcache）と、この接続は切られる。
     * 復帰しても自動では張り直されないので、そのままだと新しい書き込みが
     * 画面に出てこなくなる。復帰時に張り直して取り直す。
     */
    let subscription = subscribeToPosts();

    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      subscription.unsubscribe();
      subscription = subscribeToPosts();
      fetchPosts();
    };

    // タブに戻ってきた時は取り直すだけでよい。接続が生きていれば張り直しは無駄になる。
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchPosts();
    };

    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibility);
    };

    function subscribeToPosts() {
      return supabase
        .channel(`posts-${boardId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'posts', filter: `board_id=eq.${boardId}` },
          () => {
            fetchPosts();
          }
        )
        .subscribe();
    }
  }, [boardId, fetchPosts]);

  /**
   * 住人の様子をうかがう。
   *
   * 判定も書き込みもサーバ側で完結するので、ここは「見ているよ」と
   * 伝えるだけ。何人が同じ板を開いていても、生成は板ごとの間隔ぶんしか
   * 走らない。書き込まれたぶんは購読側が拾う。
   *
   * 投稿件数に依らず回すので、誰も書いていない板でも会話が始まる。
   */
  useEffect(() => {
    if (loading) return;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      nudgeAI();
    };
    tick();
    const timer = setInterval(tick, 60000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, boardId]);

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

  const nudgeAI = async () => {
    try {
      const res = await fetch('/api/ai-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId }),
      });
      const data = await res.json();
      // この板に書き込まれたなら取り直す。購読が生きていれば二重になるが、
      // 同じ内容で上書きされるだけなので画面は乱れない。
      if (data.postedHere) await fetchPosts();
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
