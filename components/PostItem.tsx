'use client';

import { useState, useEffect, useRef } from 'react';
import type { Post } from '@/types';
import { formatTime } from '@/lib/utils';
import { displayId } from '@/lib/short-id';
import { isDefaultStamp, type Stamp } from '@/lib/stamps';
import type { OwnedStamp } from '@/lib/use-stamps';
import StampView from './StampView';
import StampPicker from './StampPicker';
import RichText from './RichText';

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
 *
 * 押された跡は板ごとにまとめて取って、上から配られる。
 * レスごとに取りにいくと、24レスの板で24回の問い合わせが走っていた。
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
  /** この書き込みに押されたスタンプ */
  reactions: Record<string, { count: number; users: string[] }>;
  onToggleReaction: (postId: string, stampId: string) => void;
  /** スタンプ台帳と自分の持ち物 */
  stamps: Record<string, Stamp>;
  owned: Record<string, OwnedStamp>;
  /** この板で使われているスタンプ。選ぶところの「増やす入口」に出す */
  boardStampIds: string[];
  onStampsChanged: () => void;
}

/** 長押しと見なすまでの時間。短いと、押すつもりが開いてしまう */
const PEEK_HOLD_MS = 420;
/** マウスを載せてから出るまで。すぐ出ると、通り過ぎただけで開く */
const PEEK_HOVER_MS = 320;

export default function PostItem({
  post,
  index,
  parentNumber,
  onReply,
  onJumpTo,
  currentUserId,
  onDelete,
  reactions,
  onToggleReaction,
  stamps,
  owned,
  boardStampIds,
  onStampsChanged,
}: PostItemProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [notice, setNotice] = useState('');

  /**
   * 誰が押したかを覗く。
   *
   * スマホは長押し、パソコンはマウスを重ねるか右クリック。
   * pinned は「押さえて開いた」状態で、外を触るまで閉じない。
   * マウスを重ねただけのときは、離れれば閉じる。
   */
  const [peek, setPeek] = useState<{ stampId: string; pinned: boolean } | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 長押しで開いたあと、指を離した拍子にスタンプが押されるのを止める
  const heldRef = useRef(false);

  const cancelHold = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const startHold = (stampId: string, delay: number, pinned: boolean) => {
    cancelHold();
    holdTimer.current = setTimeout(() => {
      if (pinned) heldRef.current = true;
      setPeek({ stampId, pinned });
    }, delay);
  };

  useEffect(() => cancelHold, []);

  // 開いている間は Esc で閉じられるようにする
  useEffect(() => {
    if (!peek) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPeek(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [peek]);

  /** 作られたスタンプを運営に知らせる */
  const report = async (stampId: string) => {
    if (!currentUserId) return;
    if (!confirm('このスタンプを運営に知らせますか？ 何件か集まると自動で止まります。')) return;

    try {
      const res = await fetch('/api/stamps/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stampId, userId: currentUserId }),
      });
      const data = (await res.json().catch(() => ({}))) as { hidden?: boolean };
      setPeek(null);
      setNotice(data.hidden ? 'このスタンプを止めました。ありがとう' : '知らせました');
      setTimeout(() => setNotice(''), 4000);
      onStampsChanged();
    } catch {
      setNotice('知らせられませんでした');
      setTimeout(() => setNotice(''), 4000);
    }
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
        {Object.entries(reactions).map(([stampId, info]) => {
          const who = info.users.map((id) => `ID:${displayId(id)}`).join('、');
          const open = peek?.stampId === stampId;
          const mine = currentUserId ? info.users.includes(currentUserId) : false;
          const stamp = stamps[stampId];
          const label = stamp?.name || stampId;

          return (
            <span key={stampId} className="relative">
              <button
                onClick={(e) => {
                  // 長押しで開いた直後は、押した扱いにしない
                  if (heldRef.current) {
                    heldRef.current = false;
                    e.preventDefault();
                    return;
                  }
                  onToggleReaction(post.id, stampId);
                }}
                onPointerDown={(e) => {
                  if (e.pointerType !== 'mouse') startHold(stampId, PEEK_HOLD_MS, true);
                }}
                onPointerUp={cancelHold}
                onPointerCancel={cancelHold}
                onMouseEnter={() => startHold(stampId, PEEK_HOVER_MS, false)}
                onMouseLeave={() => {
                  cancelHold();
                  setPeek((prev) => (prev && prev.stampId === stampId && !prev.pinned ? null : prev));
                }}
                onContextMenu={(e) => {
                  // パソコンでは右クリックでも開く（長押しの代わり）
                  e.preventDefault();
                  cancelHold();
                  heldRef.current = false;
                  setPeek({ stampId, pinned: true });
                }}
                className="mz-mono my-1.5 inline-flex min-h-[32px] items-center gap-1 rounded-full px-2.5 tabular-nums transition-transform active:scale-95"
                aria-pressed={mine}
                aria-label={`${label} ${info.count}件${mine ? '（自分も押した）' : ''}。押した人 ${who}`}
                title={`${label} を押した人: ${who}`}
                style={{
                  border: '1.5px solid',
                  borderColor: mine ? 'var(--mz-accent)' : 'var(--mz-line-soft)',
                  background: mine ? 'var(--mz-accent-weak)' : 'var(--mz-surface)',
                  color: mine ? 'var(--mz-accent)' : 'var(--mz-ink-sub)',
                }}
              >
                <StampView id={stampId} stamp={stamp} size={17} />
                {info.count}
              </button>

              {open && (
                <>
                  {/* 押さえて開いたときだけ、外を触って閉じる面を敷く */}
                  {peek?.pinned && (
                    <div className="fixed inset-0 z-20" onClick={() => setPeek(null)} />
                  )}
                  <div
                    className="mz-card animate-fade-in absolute bottom-full left-0 z-30 mb-2 w-max max-w-[16rem] p-2.5"
                    role="dialog"
                    aria-label={`${label} を押した人`}
                  >
                    <p className="mz-ink-faint mb-1.5 flex items-center gap-1 text-[10px] leading-none">
                      <StampView id={stampId} stamp={stamp} size={14} />
                      {label} を押した人
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {info.users.map((id, i) => {
                        const you = id === currentUserId;
                        return (
                          <span
                            key={`${id}-${i}`}
                            className="mz-chip mz-mono text-[11px]"
                            style={
                              you
                                ? { background: 'var(--mz-accent)', color: 'var(--mz-accent-ink)' }
                                : { borderColor: 'var(--mz-line-soft)' }
                            }
                          >
                            {displayId(id)}
                            {you && ' あなた'}
                          </span>
                        );
                      })}
                    </div>

                    {/* 作られたスタンプには、見た人が止められる口を必ず持たせる */}
                    {!isDefaultStamp(stampId) && currentUserId && (
                      <button
                        onClick={() => report(stampId)}
                        className="mz-ink-faint mt-2 text-[10px] underline"
                      >
                        このスタンプを知らせる
                      </button>
                    )}
                  </div>
                </>
              )}
            </span>
          );
        })}

        <button
          onClick={() => setShowPicker(true)}
          className="mz-tap mz-ink-faint"
          aria-label="スタンプを押す"
        >
          スタンプ
        </button>

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

      {notice && (
        <p className="mz-accent animate-fade-in px-3 pb-2 text-[11px] sm:px-4" role="status">
          {notice}
        </p>
      )}

      {showPicker && (
        <StampPicker
          stamps={stamps}
          owned={owned}
          boardStampIds={boardStampIds}
          userId={currentUserId}
          onPick={(stampId) => {
            onToggleReaction(post.id, stampId);
            setShowPicker(false);
          }}
          onReload={onStampsChanged}
          onClose={() => setShowPicker(false)}
        />
      )}
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
        {isOwn && <span className="mz-chip mz-chip-accent">自分</span>}

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
            <RichText text={post.content} />
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
