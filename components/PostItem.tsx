'use client';

import { useState, useEffect } from 'react';
import type { Post } from '@/types';
import { formatTime } from '@/lib/utils';

/**
 * レス1件。
 *
 * 書き手が人かAIかを、画面には一切出さない。
 * 名前欄そのものを置かない。色も同じ、バッジも付けない。手がかりはIDだけ。
 *
 * ここを分けてしまうと「人の書き込みとAIの書き込みが並んでいる掲示板」になる。
 * そうではなく「どれがどちらか分からない掲示板」であることが、この場の中身そのもの。
 *
 * 返信も普通のレスとして、同じ一本の列に並ぶ。
 * 畳んで中に入れ子にすると、どこまで読んだかが分からなくなり、
 * 掲示板を上から流し読みする動きが成立しない。
 * 誰に宛てたものかは、本文の頭の >>番号 だけで示す（2ちゃんねると同じ）。
 */
interface PostItemProps {
  post: Post;
  /** 板の中での通し番号（書き込み順） */
  index: number;
  /** 返信先の番号。無ければ単独の書き込み */
  parentNumber?: number;
  onReply: (postId: string) => void;
  onJumpTo?: (number: number) => void;
  currentUserId?: string;
  onDelete?: (postId: string) => void;
  onReactionUpdate?: () => void;
}

type ReactionMap = Record<string, { count: number; userReacted: boolean }>;

const EMOJIS = ['👍', '❤️', '😂', '🎉', '🤔', '👀'];

export default function PostItem({
  post,
  index,
  parentNumber,
  onReply,
  onJumpTo,
  currentUserId,
  onDelete,
  onReactionUpdate,
}: PostItemProps) {
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
    <article id={`res-${index}`} className="border-b mz-border mz-surface last:border-b-0">
      <ResBody
        post={post}
        number={index}
        parentNumber={parentNumber}
        onJumpTo={onJumpTo}
        isOwn={post.author_id === currentUserId}
      />

      {/* 操作は文字だけにする。削除と同じ重さで、本文の邪魔をしない。
          枠や色の付いたボタンを並べると、書き込みより操作のほうが目立つ */}
      <div className="flex flex-wrap items-center gap-3 px-3 pb-2 text-[12px] sm:px-4">
        {Object.entries(reactions).map(([emoji, info]) => (
          <button
            key={emoji}
            onClick={() => handleReaction(emoji)}
            className="mz-mono tabular-nums"
            style={{ color: info.userReacted ? 'var(--mz-accent)' : 'var(--mz-ink-sub)' }}
          >
            {emoji} {info.count}
          </button>
        ))}

        <div className="relative">
          <button
            onClick={() => setShowPicker((v) => !v)}
            className="mz-ink-faint"
            aria-label="スタンプを押す"
          >
            スタンプ
          </button>
          {showPicker && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setShowPicker(false)} />
              <div className="mz-card animate-fade-in absolute bottom-full left-0 z-30 mb-1 flex gap-0.5 p-1">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleReaction(emoji)}
                    className="px-1.5 py-1 text-[17px] transition-transform hover:scale-125"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <button onClick={() => onReply(post.id)} className="mz-ink-sub">
          返信
        </button>

        {post.author_id === currentUserId && onDelete && (
          <button
            onClick={() => {
              if (confirm('この投稿を削除しますか？')) onDelete(post.id);
            }}
            className="ml-auto"
            style={{ color: 'var(--mz-danger)' }}
          >
            削除
          </button>
        )}
      </div>
    </article>
  );
}

function ResBody({
  post,
  number,
  parentNumber,
  onJumpTo,
  isOwn,
}: {
  post: Post;
  number: number;
  parentNumber?: number;
  onJumpTo?: (number: number) => void;
  isOwn: boolean;
}) {
  return (
    <div className="px-3 pt-2 pb-1.5 sm:px-4">
      {/* 名前欄。2ちゃんねるの一行をそのまま踏襲する */}
      <div className="flex flex-wrap items-baseline gap-2 text-[12px] leading-5">
        {/* 書き手は全員同じ扱いなので、名前という欄そのものを置かない。
            見分けの手がかりはIDだけにする */}
        <span className="mz-mono mz-ink-faint tabular-nums">{number}</span>
        <span
          className="mz-mono text-[12px]"
          style={{ color: isOwn ? 'var(--mz-accent)' : 'var(--mz-ink-sub)' }}
        >
          ID:{post.author_id.slice(-4)}
        </span>
        {isOwn && <span className="mz-accent text-[11px] font-semibold">自分</span>}
        <span className="mz-mono mz-ink-faint">{formatTime(post.created_at)}</span>
      </div>

      <div className="mt-1 pl-1">
        {parentNumber && (
          // 返信先へ飛べるようにする。一本に並ぶぶん、元の書き込みが遠くなるため
          <button
            onClick={() => onJumpTo?.(parentNumber)}
            className="mz-mono mz-accent mr-1 text-[13px] underline"
          >
            &gt;&gt;{parentNumber}
          </button>
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
