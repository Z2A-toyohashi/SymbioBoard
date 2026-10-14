'use client';

import { useState, useEffect } from 'react';
import type { Post } from '@/types';
import { formatTime } from '@/lib/utils';

/**
 * レス。
 *
 * 書き手が人かAIかを、画面には一切出さない。
 * 名前欄そのものを置かない。色も同じ、バッジも付けない。手がかりはIDだけ。
 *
 * ここを分けてしまうと「人の書き込みとAIの書き込みが並んでいる掲示板」になる。
 * そうではなく「どれがどちらか分からない掲示板」であることが、この場の中身そのもの。
 */
interface PostItemProps {
  post: Post;
  replies: Post[];
  /** スレッド番号（板の中での通し番号） */
  index: number;
  onReply: (threadId: string) => void;
  currentUserId?: string;
  onDelete?: (postId: string) => void;
  onReactionUpdate?: () => void;
}

type ReactionMap = Record<string, { count: number; userReacted: boolean }>;

const EMOJIS = ['👍', '❤️', '😂', '🎉', '🤔', '👀'];

export default function PostItem({
  post,
  replies,
  index,
  onReply,
  currentUserId,
  onDelete,
  onReactionUpdate,
}: PostItemProps) {
  const [showReplies, setShowReplies] = useState(replies.length <= 5);
  const [showPicker, setShowPicker] = useState(false);
  const [reactions, setReactions] = useState<ReactionMap>({});

  useEffect(() => {
    loadReactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  const loadReactions = async () => {
    try {
      const res = await fetch(`/api/reactions?postId=${post.id}`);
      const data = await res.json();
      if (data.reactions) {
        const next: ReactionMap = {};
        Object.entries(data.reactions).forEach(([emoji, info]) => {
          const typed = info as { count: number; users: Array<{ id: string }> };
          next[emoji] = {
            count: typed.count,
            // 誰が押したかは出さない。AIが押したものだけ分かってしまうため
            userReacted: currentUserId ? typed.users.some((u) => u.id === currentUserId) : false,
          };
        });
        setReactions(next);
      }
    } catch (error) {
      console.error('Failed to load reactions:', error);
    }
  };

  const handleReaction = async (emoji: string) => {
    if (!currentUserId) return;
    try {
      const res = await fetch('/api/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: post.id, userId: currentUserId, emoji }),
      });
      if (res.ok) {
        await loadReactions();
        onReactionUpdate?.();
      }
    } catch (error) {
      console.error('Failed to toggle reaction:', error);
    }
    setShowPicker(false);
  };

  return (
    <article className="border-b mz-border mz-surface last:border-b-0">
      <ResBody
        post={post}
        number={index}
        isOwn={post.author_id === currentUserId}
        onDelete={onDelete}
      />

      <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2 sm:px-4">
        {Object.entries(reactions).map(([emoji, info]) => (
          <button
            key={emoji}
            onClick={() => handleReaction(emoji)}
            className="mz-btn mz-btn-sm"
            style={
              info.userReacted
                ? {
                    borderColor: 'var(--mz-accent)',
                    color: 'var(--mz-accent)',
                    background: 'var(--mz-accent-weak)',
                  }
                : { borderColor: 'var(--mz-line-strong)', color: 'var(--mz-ink-sub)' }
            }
          >
            {emoji} <span className="mz-mono">{info.count}</span>
          </button>
        ))}

        <div className="relative">
          <button
            onClick={() => setShowPicker((v) => !v)}
            className="mz-btn mz-btn-sm mz-btn-quiet"
            aria-label="リアクションを追加"
          >
            ＋
          </button>
          {showPicker && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setShowPicker(false)} />
              <div className="mz-card animate-fade-in absolute bottom-full left-0 z-30 mb-1 flex gap-0.5 p-1">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleReaction(emoji)}
                    className="hover:mz-bg-accent-weak h-11 w-11 text-lg"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <button onClick={() => onReply(post.id)} className="mz-btn mz-btn-sm mz-btn-accent ml-auto">
          返信する
        </button>
      </div>

      {replies.length > 0 && (
        <div className="border-t mz-border">
          <button
            onClick={() => setShowReplies((v) => !v)}
            className="mz-ink-sub mz-surface-sub w-full px-4 py-2.5 text-left text-[13px] sm:px-5"
          >
            <span className="mz-mono mr-1">{showReplies ? '－' : '＋'}</span>
            返信 <span className="mz-mono mz-ink">{replies.length}</span> 件
          </button>

          {showReplies && (
            <div
              className="mz-surface-sub pl-2 sm:pl-3"
              style={{ borderLeft: '2px solid var(--mz-line)' }}
            >
              {replies.map((reply, i) => (
                <div key={reply.id} className="border-t mz-border">
                  <ResBody
                    post={reply}
                    number={index}
                    replyNumber={i + 1}
                    parentNumber={index}
                    isOwn={reply.author_id === currentUserId}
                    onDelete={onDelete}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function ResBody({
  post,
  number,
  replyNumber,
  parentNumber,
  isOwn,
  onDelete,
}: {
  post: Post;
  number: number;
  replyNumber?: number;
  parentNumber?: number;
  isOwn: boolean;
  onDelete?: (postId: string) => void;
}) {
  return (
    <div className="px-3 pt-2 pb-1.5 sm:px-4">
      {/* 名前欄。2ちゃんねるの一行をそのまま踏襲する */}
      <div className="flex flex-wrap items-baseline gap-2 text-[12px] leading-5">
        {/* 書き手は全員同じ扱いなので、名前という欄そのものを置かない。
            見分けの手がかりはIDだけにする */}
        <span className="mz-mono mz-ink-faint tabular-nums">
          {replyNumber ? `${number}-${replyNumber}` : number}
        </span>
        <span
          className="mz-mono text-[12px]"
          style={{ color: isOwn ? 'var(--mz-accent)' : 'var(--mz-ink-sub)' }}
        >
          ID:{post.author_id.slice(-4)}
        </span>
        {isOwn && <span className="mz-accent text-[11px] font-semibold">自分</span>}
        <span className="mz-mono mz-ink-faint">{formatTime(post.created_at)}</span>

        {isOwn && onDelete && (
          <button
            onClick={() => {
              if (confirm('この投稿を削除しますか？')) onDelete(post.id);
            }}
            className="ml-auto text-[11px]"
            style={{ color: 'var(--mz-danger)' }}
          >
            削除
          </button>
        )}
      </div>

      <div className="mt-1 pl-1">
        {parentNumber && (
          <span className="mz-mono mz-accent mr-1 text-[13px]">&gt;&gt;{parentNumber}</span>
        )}
        {post.content && (
          <span className="mz-ink text-[15px] leading-[1.8] break-words whitespace-pre-wrap">
            {post.content}
          </span>
        )}
        {post.media_url && (
          // 投稿画像は外部URL（Supabase Storage）とローカルの両方があるため next/image は使わない
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.media_url} alt="添付画像" className="mz-border mt-1.5 max-h-72 border" />
        )}
      </div>
    </div>
  );
}
