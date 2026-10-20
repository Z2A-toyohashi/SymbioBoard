'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 「&gt;&gt;12」。
 *
 * 返信が同じ一本の列に並ぶ作りなので、宛先は番号でしか示されない。
 * 番号だけだと、そのレスを読むには列を遡って探し、読んだら元の位置まで
 * 戻ってこなければならない。長い板ではこれで流れが切れる。
 *
 * そこで、触れば中身が出るようにした。押せば移動（従来どおり）、
 * 載せる・長押しで覗くだけ。覗ければ、多くの場合は移動そのものが要らなくなる。
 *
 * 本文の中の &gt;&gt;12 もここを通る（components/RichText.tsx）。
 * 住人も人も本文に &gt;&gt;番号 を書くので、返信欄から付いた宛先だけが
 * 押せる状態だと、同じものが2通りに見えてしまう。
 *
 * 覗く操作は PostItem のスタンプと同じ間合いに揃えてある。
 * 画面の中で「長押しで覗く」が2種類の速さで動くと、手が覚えられない。
 *
 * 開き方を状態（ref ではなく state）で持っているのは、
 * 開いているかどうかが描画の中身を決めるから。
 * ref を描画中に読むと、変わっても描き直されない。
 */

/** 長押しと見なすまでの時間 */
const HOLD_MS = 420;
/** マウスを載せてから出るまで */
const HOVER_MS = 320;

/**
 * 開き方。
 * hover  … 載せているあいだだけ。離れれば閉じる
 * pinned … 押さえて開いた。外を触るまで閉じない
 */
type PeekMode = 'hover' | 'pinned';

interface ResRefProps {
  number: number;
  onJump?: (number: number) => void;
  /** 覗いたときに出す中身。取れないときは渡さない（押せば移動だけする） */
  preview?: { authorLabel: string; excerpt: string } | null;
  /**
   * 見え方。
   * strong … 名前欄の下に出る宛先。黄色い札で、レスの頭として目立たせる
   * inline … 本文に混ざっているもの。文字の流れを切らない
   */
  tone?: 'strong' | 'inline';
}

export default function ResRef({ number, onJump, preview, tone = 'inline' }: ResRefProps) {
  const [peek, setPeek] = useState<PeekMode | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 長押しで開いた直後に指を離すと、そのまま移動してしまうのを止める
  const heldRef = useRef(false);

  const cancel = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const start = (delay: number, mode: PeekMode) => {
    if (!preview) return;
    cancel();
    timer.current = setTimeout(() => {
      if (mode === 'pinned') heldRef.current = true;
      setPeek(mode);
    }, delay);
  };

  useEffect(() => cancel, []);

  useEffect(() => {
    if (!peek) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPeek(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [peek]);

  const strong = tone === 'strong';

  return (
    <span className="relative inline-block">
      <button
        onClick={() => {
          if (heldRef.current) {
            heldRef.current = false;
            return;
          }
          onJump?.(number);
        }}
        onPointerDown={(e) => {
          if (e.pointerType !== 'mouse') start(HOLD_MS, 'pinned');
        }}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onMouseEnter={() => start(HOVER_MS, 'hover')}
        onMouseLeave={() => {
          cancel();
          setPeek((prev) => (prev === 'hover' ? null : prev));
        }}
        onContextMenu={(e) => {
          if (!preview) return;
          e.preventDefault();
          cancel();
          heldRef.current = false;
          setPeek('pinned');
        }}
        className={
          strong
            ? 'mz-mono mr-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-bold transition-transform active:scale-95'
            : 'mz-mono inline-flex items-center rounded-full px-1.5 text-[13px] font-bold underline underline-offset-2 transition-transform active:scale-95'
        }
        style={
          strong
            ? {
                background: 'var(--mz-sun)',
                color: '#17140f',
                border: '1.5px solid var(--mz-line)',
              }
            : { color: 'var(--mz-accent)' }
        }
        aria-label={
          preview
            ? `${number}番の書き込みへ移動。長押しで中身を見る`
            : `${number}番の書き込みへ移動`
        }
      >
        &gt;&gt;{number}
      </button>

      {peek && preview && (
        <>
          {/* 押さえて開いたときだけ、外を触って閉じる面を敷く */}
          {peek === 'pinned' && (
            <span className="fixed inset-0 z-20" onClick={() => setPeek(null)} />
          )}
          <span
            className="mz-card animate-fade-in absolute bottom-full left-0 z-30 mb-2 block w-max max-w-[18rem] p-2.5"
            role="dialog"
            aria-label={`${number}番の書き込み`}
          >
            <span className="mz-ink-faint mz-mono mb-1 block text-[10px] leading-none">
              {number} {preview.authorLabel}
            </span>
            <span className="mz-ink block text-[12px] leading-relaxed break-words whitespace-pre-wrap">
              {preview.excerpt}
            </span>
          </span>
        </>
      )}
    </span>
  );
}
