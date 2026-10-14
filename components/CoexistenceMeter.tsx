'use client';

import { useEffect, useRef, useState } from 'react';
import type { AIMood, Post } from '@/types';
import { SPACE_STATE_LABEL } from '@/types';

/**
 * 共存度。
 *
 * この板で、いま人とAIがどれくらい混ざり合っているかを一つの数字で出す。
 * 中身は「次の書き込みが起きる見込み」で、場が静かなほど上がる。
 *
 * 画面には「AI」と書かない。どれがAIの書き込みか分からないことが
 * この場の中身なので、計器がそれを明かしては意味がない。
 *
 * 押せる要素は置かない。読むだけの計器なので、開閉させると
 * 本文を読みにきた人の手を一度止めてしまう。
 *
 * 値は一度取れたら消さない。取得に失敗しても直前の値を出したままにする。
 * 計器が点いたり消えたりすると、場の状態ではなく通信の状態を見ることになる。
 */
interface CoexistenceMeterProps {
  posts: Post[];
}

const TICKS = 24;

export default function CoexistenceMeter({ posts }: CoexistenceMeterProps) {
  const [mood, setMood] = useState<AIMood | null>(null);
  const postsRef = useRef(posts);
  postsRef.current = posts;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch('/api/ai-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ posts: postsRef.current }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as AIMood;
        if (!cancelled) setMood(data);
      } catch {
        // 取れなければ直前の値を残す
      }
    };

    load();
    const timer = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // 投稿の変化は ref 越しに読む。配列が変わるたびに計測を止めないため
  }, []);

  const label = mood ? SPACE_STATE_LABEL[mood.state] : null;
  const percent = mood ? Math.round(mood.probability * 100) : 0;
  const lit = Math.round((percent / 100) * TICKS);

  return (
    <div className="mz-chrome mz-border sticky top-14 z-20 border-b">
      <div className="mx-auto flex max-w-[1180px] items-center gap-3 px-4 py-2.5 sm:gap-4 sm:px-6">
        <span className="mz-ink-sub shrink-0 text-[12px] font-semibold tracking-[0.04em]">
          共存度
        </span>

        <span className="mz-mono mz-ink shrink-0 text-[19px] leading-none font-bold tabular-nums">
          {mood ? percent : '–'}
          <span className="mz-ink-faint ml-0.5 text-[12px] font-normal">%</span>
        </span>

        {/* 目盛り。狭い画面では帯に差し替える */}
        <span className="hidden shrink-0 items-center gap-[2px] sm:flex" aria-hidden>
          {Array.from({ length: TICKS }).map((_, i) => (
            <span
              key={i}
              className="h-3.5 w-[3px] rounded-full"
              style={{
                background: i < lit ? 'var(--mz-accent)' : 'var(--mz-line)',
                transition: 'background-color 240ms ease-out',
              }}
            />
          ))}
        </span>

        <span
          className="h-1.5 flex-1 overflow-hidden rounded-full sm:hidden"
          style={{ background: 'var(--mz-line)' }}
          aria-hidden
        >
          <span
            className="block h-full rounded-full"
            style={{
              width: `${percent}%`,
              background: 'var(--mz-accent)',
              transition: 'width 320ms ease-out',
            }}
          />
        </span>

        {label && <span className="mz-ink-sub ml-auto shrink-0 text-[12px]">{label.name}</span>}
      </div>
    </div>
  );
}
