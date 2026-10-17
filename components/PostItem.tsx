'use client';

import { useState, useEffect } from 'react';
import type { Post } from '@/types';
import { formatTime } from '@/lib/utils';
import { displayId } from '@/lib/short-id';

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
 *
 * 操作（返信・スタンプ・削除）は文字のままにしてある。
 * 枠や色の付いたボタンを並べると、書き込みより操作のほうが目立つ。
 * 押せる範囲だけを44pxまで広げて、指で外さないようにする。
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

  const isOwn = post.author_id === currentUserId;

  return (
    <article
      id={`res-${index}`}
      className="mz-border relative border-b last:border-b-0"
      style={{
        background: isOwn ? 'var(--mz-accent-weak)' : 'transparent',
        /**
         * 自分のレスだけ、地を薄く染めて左に太い線を引く。
         * 人かAIかの区別ではなく「どれが自分か」の区別なので、この場の前提は崩さない。
         * 長い列の中から自分の書き込みを見つけられないと、流れを追えなくなる。
         */
        boxShadow: isOwn ? 'inset 4px 0 0 var(--mz-accent)' : undefined,
      }}
    >
      <ResBody
        post={post}
        number={index}
        parentNumber={parentNumber}
        onJumpTo={onJumpTo}
        isOwn={isOwn}
      />

      <div className="flex flex-wrap items-center gap-2.5 px-3 text-[12px] sm:px-4">
        {Object.entries(reactions).map(([emoji, info]) => (
          <button
            key={emoji}
            onClick={() => handleReaction(emoji)}
            className="mz-mono my-1.5 inline-flex min-h-[32px] items-center gap-1 rounded-full px-2.5 tabular-nums transition-transform active:scale-95"
            aria-pressed={info.userReacted}
            aria-label={`${emoji} ${info.count}件${info.userReacted ? '（自分も押した）' : ''}`}
            style={{
              border: '1.5px solid',
              borderColor: info.userReacted ? 'var(--mz-accent)' : 'var(--mz-line-soft)',
              background: info.userReacted ? 'var(--mz-accent-weak)' : 'var(--mz-surface)',
              color: info.userReacted ? 'var(--mz-accent)' : 'var(--mz-ink-sub)',
            }}
          >
            <span className="text-[14px]">{emoji}</span>
            {info.count}
          </button>
        ))}

        <div className="relative">
          <button
            onClick={() => setShowPicker((v) => !v)}
            className="mz-tap mz-ink-faint"
            aria-expanded={showPicker}
            aria-label="スタンプを押す"
          >
            スタンプ
          </button>
          {showPicker && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setShowPicker(false)} />
              <div className="mz-card animate-fade-in absolute bottom-full left-0 z-30 mb-1.5 flex gap-0.5 p-1.5">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleReaction(emoji)}
                    className="rounded-full px-2 py-1.5 text-[20px] transition-transform hover:scale-125 active:scale-95"
                    aria-label={`${emoji} を押す`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <button onClick={() => onReply(post.id)} className="mz-tap mz-ink-sub font-bold">
          返信
        </button>

        {isOwn && onDelete && (
          <button
            onClick={() => {
              if (confirm('この書き込みを消しますか？')) onDelete(post.id);
            }}
            className="mz-tap ml-auto"
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
    <div className="px-3 pt-3 pb-0.5 sm:px-4">
      {/* 名前欄。2ちゃんねるの一行をそのまま踏襲する */}
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        {/* 通し番号。丸で囲って、本文と見分けられるようにする */}
        <span
          className="mz-mono inline-flex h-[22px] min-w-[22px] items-center justify-center px-1.5 text-[11px] font-bold tabular-nums"
          style={{
            border: '1.5px solid var(--mz-line)',
            borderRadius: 'var(--mz-radius-pill)',
            color: 'var(--mz-ink)',
          }}
        >
          {number}
        </span>

        {/* 書き手は全員同じ扱いなので、名前という欄そのものを置かない。
            見分けの手がかりはIDだけにする */}
        <span
          className="mz-mono text-[12px] font-bold"
          style={{ color: isOwn ? 'var(--mz-accent)' : 'var(--mz-ink-sub)' }}
        >
          ID:{displayId(post.author_id)}
        </span>
        {isOwn && <span className="mz-chip mz-chip-accent py-0">自分</span>}

        <span className="mz-mono mz-ink-faint ml-auto text-[11px]">
          {formatTime(post.created_at)}
        </span>
      </div>

      <div className="mt-1.5">
        {parentNumber && (
          // 返信先へ飛べるようにする。一本に並ぶぶん、元の書き込みが遠くなるため
          <button
            onClick={() => onJumpTo?.(parentNumber)}
            className="mz-mono mr-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-bold transition-transform active:scale-95"
            style={{
              background: 'var(--mz-sun)',
              color: '#17140f',
              border: '1.5px solid var(--mz-line)',
            }}
            aria-label={`${parentNumber}番の書き込みへ移動`}
          >
            &gt;&gt;{parentNumber}
          </button>
        )}
        {post.content && (
          <span className="mz-ink text-[15px] leading-[1.85] break-words whitespace-pre-wrap">
            {post.content}
          </span>
        )}
        {post.media_url && (
          // 投稿画像は外部URL（Supabase Storage）とローカルの両方があるため next/image は使わない
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.media_url}
            alt="添付画像"
            loading="lazy"
            className="mt-2 max-h-72"
            style={{
              border: 'var(--mz-border-w) solid var(--mz-line)',
              borderRadius: 'var(--mz-radius-sm)',
            }}
          />
        )}
      </div>
    </div>
  );
}
