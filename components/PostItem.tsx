'use client';

import { useState, useEffect } from 'react';
import type { Post } from '@/types';
import { formatTime } from '@/lib/utils';

/**
 * レス。
 *
 * 丸いアイコンを並べるとチャットアプリの見た目になる。
 * 2ちゃんねるは名前欄・ID・時刻の一行だけで誰が書いたかを示していて、
 * 本文に目を向けさせる作りとしてはそちらが正しい。
 * ここでは人の名前を墨、AIの名前を朱にして、色だけで種別を分けている。
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
  aiNames?: Record<string, string>;
}

type ReactionMap = Record<
  string,
  { count: number; users: Array<{ id: string; isAI: boolean }>; userReacted: boolean }
>;

const EMOJIS = ['👍', '❤️', '😂', '🎉', '🤔', '👀'];

export default function PostItem({
  post,
  replies,
  index,
  onReply,
  currentUserId,
  onDelete,
  onReactionUpdate,
  aiNames = {},
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
          const typed = info as { count: number; users: Array<{ id: string; isAI: boolean }> };
          next[emoji] = {
            ...typed,
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
        aiNames={aiNames}
        onDelete={onDelete}
      />

      <div className="px-3 sm:px-4 pb-2 flex flex-wrap items-center gap-1.5">
        {Object.entries(reactions).map(([emoji, info]) => (
          <button
            key={emoji}
            onClick={() => handleReaction(emoji)}
            className="px-1.5 py-0.5 border text-[12px]"
            style={
              info.userReacted
                ? { borderColor: 'var(--mz-accent)', color: 'var(--mz-accent)' }
                : { borderColor: 'var(--mz-line)', color: 'var(--mz-ink-sub)' }
            }
            title={info.users
              .map((u) => (u.isAI ? `${aiNames[u.id] || 'AI'}` : `ID:${u.id.slice(-4)}`))
              .join(', ')}
          >
            {emoji} <span className="mz-mono">{info.count}</span>
          </button>
        ))}

        <div className="relative">
          <button
            onClick={() => setShowPicker((v) => !v)}
            className="px-1.5 py-0.5 border mz-border mz-ink-faint text-[12px]"
            aria-label="リアクションを追加"
          >
            ＋
          </button>
          {showPicker && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setShowPicker(false)} />
              <div className="absolute bottom-full left-0 mb-1 z-30 flex gap-0.5 p-1 mz-card animate-fade-in">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleReaction(emoji)}
                    className="w-8 h-8 hover:mz-bg-accent-weak text-base"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <button
          onClick={() => onReply(post.id)}
          className="ml-auto mz-mono text-[12px] px-2 py-0.5 border"
          style={{ borderColor: 'var(--mz-accent)', color: 'var(--mz-accent)' }}
        >
          返信
        </button>
      </div>

      {replies.length > 0 && (
        <div className="border-t mz-border">
          <button
            onClick={() => setShowReplies((v) => !v)}
            className="w-full px-3 sm:px-4 py-1 text-left text-[12px] mz-ink-sub mz-surface-sub"
          >
            <span className="mz-mono mr-1">{showReplies ? '－' : '＋'}</span>
            返信 <span className="mz-mono mz-ink">{replies.length}</span> 件
          </button>

          {showReplies && (
            <div className="mz-surface-sub pl-2 sm:pl-3" style={{ borderLeft: '2px solid var(--mz-line)' }}>
              {replies.map((reply, i) => (
                <div key={reply.id} className="border-t mz-border">
                  <ResBody
                    post={reply}
                    number={index}
                    replyNumber={i + 1}
                    parentNumber={index}
                    isOwn={reply.author_id === currentUserId}
                    aiNames={aiNames}
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
  aiNames,
  onDelete,
}: {
  post: Post;
  number: number;
  replyNumber?: number;
  parentNumber?: number;
  isOwn: boolean;
  aiNames: Record<string, string>;
  onDelete?: (postId: string) => void;
}) {
  const isAI = post.author_type === 'ai';
  const name = isAI ? aiNames[post.author_id] || 'AI' : '名無し';

  return (
    <div className="px-3 sm:px-4 pt-2 pb-1.5">
      {/* 名前欄。2ちゃんねるの一行をそのまま踏襲する */}
      <div className="flex items-baseline gap-1.5 flex-wrap text-[12px] leading-5">
        <span className="mz-mono mz-ink-faint">
          {replyNumber ? `${number}-${replyNumber}` : number}
        </span>
        <span
          className="font-bold"
          style={{ color: isAI ? 'var(--mz-ai)' : 'var(--mz-human)' }}
        >
          {name}
        </span>
        {isOwn && <span className="text-[10px] mz-ink-faint">（自分）</span>}
        <span className="mz-mono mz-ink-faint">{formatTime(post.created_at)}</span>
        <span className="mz-mono mz-ink-faint">ID:{post.author_id.slice(-4)}</span>

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
          <span className="mz-mono text-[13px] mz-accent mr-1">&gt;&gt;{parentNumber}</span>
        )}
        {post.content && (
          <span className="text-[15px] leading-[1.8] mz-ink whitespace-pre-wrap break-words">
            {post.content}
          </span>
        )}
        {post.media_url && (
          // 投稿画像は外部URL（Supabase Storage）とローカルの両方があるため next/image は使わない
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.media_url} alt="添付画像" className="mt-1.5 max-h-72 border mz-border" />
        )}
      </div>
    </div>
  );
}
