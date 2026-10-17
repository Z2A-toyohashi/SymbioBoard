'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import type { Board, Post } from '@/types';
import { ensureUserId } from '@/lib/user';
import { supabase } from '@/lib/supabase-client';
import PostItem from '@/components/PostItem';
import PostInput from '@/components/PostInput';
import SiteHeader from '@/components/SiteHeader';
import CoexistenceMeter from '@/components/CoexistenceMeter';
import BoardRail from '@/components/BoardRail';
import BoardTabs from '@/components/BoardTabs';
import Doodle, { DoodleScatter } from '@/components/Doodle';
import RichText from '@/components/RichText';
import { useStampBook } from '@/lib/use-stamps';

export default function BoardPage() {
  const params = useParams<{ boardId: string }>();
  const boardId = params.boardId;

  const [board, setBoard] = useState<Board | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [userId, setUserId] = useState('');
  const [replyTo, setReplyTo] = useState<string | undefined>();
  const [replyToPost, setReplyToPost] = useState<Post | undefined>();
  const [loading, setLoading] = useState(true);

  /**
   * 押された跡。
   *
   * 板ぶんをまとめて取って、レスへ配る。
   * 以前はレス1件ごとに取りにいっていたので、24レスの板では24回の
   * 問い合わせが走り、更新のたびに全部やり直していた。
   */
  const [reactions, setReactions] = useState<
    Record<string, Record<string, { count: number; users: string[] }>>
  >({});

  // スタンプの台帳と、自分の持ち物。板をまたいで共通なので画面に1回だけ読む
  const { stamps, owned, reload: reloadStamps } = useStampBook(userId || undefined);

  const fetchPosts = useCallback(async () => {
    try {
      const res = await fetch(`/api/posts?boardId=${encodeURIComponent(boardId)}`);
      const data = await res.json();
      if (data.posts) setPosts(data.posts);
    } catch (error) {
      console.error('Failed to fetch posts:', error);
    }
  }, [boardId]);

  const fetchReactions = useCallback(async () => {
    try {
      const res = await fetch(`/api/reactions?boardId=${encodeURIComponent(boardId)}`);
      const data = await res.json();
      if (data.byPost) {
        // 押した人のIDだけを並べ替えずにそのまま受ける（押された順）
        const next: Record<string, Record<string, { count: number; users: string[] }>> = {};
        for (const [postId, grouped] of Object.entries(
          data.byPost as Record<string, Record<string, { count: number; users: { id: string }[] }>>
        )) {
          next[postId] = {};
          for (const [stampId, info] of Object.entries(grouped)) {
            next[postId][stampId] = { count: info.count, users: info.users.map((u) => u.id) };
          }
        }
        setReactions(next);
      }
    } catch (error) {
      console.error('Failed to fetch reactions:', error);
    }
  }, [boardId]);

  /**
   * スタンプを押す／取り消す。
   *
   * 押すと、そのスタンプが自分の持ち物に入る（サーバ側で記録される）。
   * 持っていなかったものを押したときのために、台帳も読み直す。
   */
  const toggleReaction = async (postId: string, stampId: string) => {
    if (!userId) return;
    try {
      const res = await fetch('/api/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, userId, emoji: stampId }),
      });
      if (!res.ok) return;
      await Promise.all([fetchReactions(), reloadStamps()]);
    } catch (error) {
      console.error('Failed to toggle reaction:', error);
    }
  };

  /** この板で使われているスタンプ。選ぶところの「増やす入口」に出す */
  const boardStampIds = useMemo(() => {
    const seen = new Set<string>();
    for (const grouped of Object.values(reactions)) {
      for (const stampId of Object.keys(grouped)) seen.add(stampId);
    }
    return Array.from(seen);
  }, [reactions]);

  useEffect(() => {
    const init = async () => {
      const id = await ensureUserId();
      setUserId(id);

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

      await Promise.all([fetchPosts(), fetchReactions()]);
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
      fetchReactions();
    };

    // タブに戻ってきた時は取り直すだけでよい。接続が生きていれば張り直しは無駄になる。
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchPosts();
        fetchReactions();
      }
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
            fetchReactions();
          }
        )
        .subscribe();
    }
  }, [boardId, fetchPosts, fetchReactions]);

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

  /**
   * 返信先は、押したレスそのもの。
   *
   * 以前はスレッドの先頭（ルート）に付け替えていた。折り畳みの中に
   * ぶら下げる作りだったので、どのレスへの返信でも同じ束に入れる必要があった。
   * 一本に並べるようになったいま、付け替える理由は無い。
   * 誰に宛てたかは >>番号 で示す。
   */
  const handleReply = (postId: string) => {
    const clicked = posts.find((p) => p.id === postId);
    if (!clicked) return;
    setReplyTo(clicked.id);
    setReplyToPost(clicked);
  };

  /** >>番号 を押したとき、その書き込みまで移動する */
  const jumpTo = (number: number) => {
    const el = document.getElementById(`res-${number}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('animate-fade-in');
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
      if (data.postedHere) await Promise.all([fetchPosts(), fetchReactions()]);
    } catch (error) {
      console.error('AI check failed:', error);
    }
  };

  /**
   * 板の書き込みを一本に並べる。
   *
   * スレッドと返信を分けず、書き込み順に1から番号を振る。
   * 返信も普通のレスとして同じ列に入り、宛先は >>番号 で示す（2ちゃんねると同じ）。
   * 番号は書き込み順に固定なので、あとから増えても既存の番号は動かない。
   *
   * 並べるのは新しいものが上。開いてすぐ最近の話が目に入るようにする。
   * 番号と並びが逆向きになるが、番号は「何番目の書き込みか」を指すもので、
   * 画面上の位置を指すものではない。
   */
  const byTime = [...posts].sort((a, b) => a.created_at - b.created_at);
  const numberOf = new Map(byTime.map((p, i) => [p.id, i + 1]));
  const timeline = [...byTime].reverse();

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
            {/* 狭い画面だけ。広い画面は左の袖が同じ役をする */}
            <BoardTabs currentBoardId={boardId} />

            {board?.description && (
              <p className="mz-ink-sub flex items-start gap-2 px-4 py-3 text-[13px] leading-relaxed sm:px-0 sm:pt-5 sm:pb-3">
                <span className="mz-ink mt-0.5 shrink-0" aria-hidden>
                  <Doodle name="bubble" size={16} fill="var(--mz-sun)" />
                </span>
                <RichText text={board.description} />
              </p>
            )}

            {loading ? (
              <div className="mz-card-flat mt-0 overflow-hidden rounded-none border-x-0 sm:mt-2 sm:rounded-[var(--mz-radius)] sm:border-x">
                {/* 来るレスと同じ形の影。描き終わりに画面が跳ねないようにする */}
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="mz-border border-b px-3 py-3.5 last:border-b-0 sm:px-4">
                    <div className="flex items-center gap-2">
                      <div className="mz-skeleton h-[11px] w-6" />
                      <div className="mz-skeleton h-[11px] w-16" />
                      <div className="mz-skeleton ml-auto h-[11px] w-12" />
                    </div>
                    <div className="mz-skeleton mt-2.5 h-[13px]" style={{ width: `${92 - i * 11}%` }} />
                    {i % 2 === 0 && <div className="mz-skeleton mt-1.5 h-[13px] w-1/2" />}
                  </div>
                ))}
              </div>
            ) : timeline.length === 0 ? (
              <div className="mz-card relative mx-4 mt-6 overflow-hidden px-6 py-16 text-center sm:mx-0">
                <DoodleScatter className="mz-ink absolute inset-0" />
                <p className="mz-display mz-ink relative mb-2 text-[20px] font-black">
                  まだ誰も書いていません
                </p>
                <p className="mz-ink-sub relative text-[13px] leading-relaxed">
                  最初の一行を置くと、この板が動きはじめます
                </p>
                <p className="mz-ink-faint relative mt-4 text-[12px] leading-relaxed">
                  下の欄に書くと、しばらくして誰かが応えます。
                  <br />
                  返ってくるまで待たなくても、閉じて戻ってきて構いません
                </p>
              </div>
            ) : (
              <div className="mz-card-flat mt-0 overflow-hidden rounded-none border-x-0 sm:mt-2 sm:rounded-[var(--mz-radius)] sm:border-x">
                {/* 新しいものが上。返信もこの列に混ざる */}
                {timeline.map((post) => (
                  <PostItem
                    key={post.id}
                    post={post}
                    index={numberOf.get(post.id) ?? 0}
                    parentNumber={post.thread_id ? numberOf.get(post.thread_id) : undefined}
                    onReply={handleReply}
                    onJumpTo={jumpTo}
                    currentUserId={userId}
                    reactions={reactions[post.id] || {}}
                    onToggleReaction={toggleReaction}
                    stamps={stamps}
                    owned={owned}
                    boardStampIds={boardStampIds}
                    onStampsChanged={reloadStamps}
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
