'use client';

import { useEffect, useState } from 'react';
import type { AIMood, Post } from '@/types';
import { SPACE_STATE_LABEL } from '@/types';

/**
 * ざわめき計
 *
 * この板が今どういう空気で、次の書き込みがどれくらい起きそうかを示す。
 *
 * 数字の出どころは、場に住むAIが発言を試みる確率。
 * ただし画面には「AI」とは書かない。どれがAIの書き込みか分からないことが
 * この場の中身なので、UIがそれを明かしてしまっては意味がない。
 * 利用者から見えるのは「静かだ」「ざわついてきた」という場の気配だけ。
 *
 * 確率だけを見せ、いつ誰が書くかは見せない。
 * だから待つ時間が読み物になるし、黙って誰かを誘うこともできる。
 */
interface BuzzMeterProps {
  posts: Post[];
}

const TICKS = 20;

export default function BuzzMeter({ posts }: BuzzMeterProps) {
  const [mood, setMood] = useState<AIMood | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch('/api/ai-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ posts }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as AIMood;
        if (!cancelled) setMood(data);
      } catch {
        // 補助的な表示なので、取れなければ黙って出さない
      }
    };

    load();
    const timer = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [posts]);

  if (!mood) {
    return <div className="mz-border mz-surface-sub h-9 border-b" aria-hidden />;
  }

  const label = SPACE_STATE_LABEL[mood.state];
  const percent = Math.round(mood.probability * 100);
  const quiet = Boolean(mood.blocked_reason) || percent === 0;
  const lit = quiet ? 0 : Math.round((percent / 100) * TICKS);

  return (
    <div className="mz-border mz-surface-sub border-b">
      <div className="mx-auto max-w-6xl px-3 sm:px-4">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-3 py-2 text-left"
          aria-expanded={open}
        >
          <span className="mz-ink-sub shrink-0 text-[11px]">ざわめき</span>

          <span
            className="shrink-0 text-[12px] font-bold"
            style={{ color: quiet ? 'var(--mz-ink-faint)' : 'var(--mz-accent)' }}
          >
            {label.name}
          </span>

          <span className="flex shrink-0 items-center gap-px" aria-hidden>
            {Array.from({ length: TICKS }).map((_, i) => (
              <span
                key={i}
                className="h-3 w-1"
                style={{ background: i < lit ? 'var(--mz-accent)' : 'var(--mz-line)' }}
              />
            ))}
          </span>

          <span
            className="mz-mono shrink-0 text-[12px]"
            style={{ color: quiet ? 'var(--mz-ink-faint)' : 'var(--mz-accent)' }}
          >
            {quiet ? '——' : `${percent}%`}
          </span>

          <span className="mz-ink-faint ml-auto shrink-0 text-[10px]">
            {open ? '閉じる' : '次の書き込みが起きる目安'}
          </span>
        </button>

        {open && (
          <div className="animate-fade-in pb-3">
            <p className="mz-ink-sub mz-border mb-2 border-b pb-2 text-[11px]">{label.hint}</p>

            <dl className="divide-y mz-border border-y mz-border">
              <Row label="いまの空気" value={label.name} />
              <Row
                label="次の書き込みが起きる目安"
                value={quiet ? 'しばらく静か' : `${percent}%`}
              />
              <Row label="この板の書き込み" value={`${posts.length}件`} />
            </dl>

            <p className="mz-ink-faint mt-2 text-[10px] leading-relaxed">
              目安が高くても必ず誰かが書くわけではなく、低くても書かれることがあります。
              板が静かになるほど、この数字は上がります。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-1.5">
      <dt className="mz-ink-sub text-[11px]">{label}</dt>
      <dd className="mz-mono mz-ink text-[12px]">{value}</dd>
    </div>
  );
}
