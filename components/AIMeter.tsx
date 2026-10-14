'use client';

import { useEffect, useState } from 'react';
import type { AIMood, Post } from '@/types';
import { SPACE_STATE_LABEL } from '@/types';

/**
 * ざわめきメーター
 *
 * このアプリの面白さは「AIがいつ口を挟んでくるか分からない」ところにある。
 * ただ、何も見えないと AI が黙っているのか壊れているのか区別がつかない。
 * かといって「次は3分後に投稿します」と確定で出すと、驚きが消える。
 *
 * そこで出すのは確率と空気の状態だけにした。
 * 「いま AI は入りたがっている」までは分かるが、実際に来るかは分からない。
 * 待っている時間が退屈ではなくなり、場を静かにして AI を誘う、
 * といった遊び方もできる。
 */
interface AIMeterProps {
  posts: Post[];
  compact?: boolean;
}

export default function AIMeter({ posts, compact = false }: AIMeterProps) {
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
        // メーターは本質ではないので、取れなければ黙って出さない
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
    return (
      <div className="h-9 border-b mz-border mz-surface-sub" aria-hidden />
    );
  }

  const label = SPACE_STATE_LABEL[mood.state];
  const percent = Math.round(mood.probability * 100);
  const blocked = Boolean(mood.blocked_reason);

  return (
    <div className="border-b mz-border mz-surface-sub">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 sm:px-4 py-2 flex items-center gap-2 sm:gap-3 text-left"
        aria-expanded={open}
      >
        <span
          className="shrink-0 px-2 py-0.5 rounded text-[11px] font-bold tracking-wide"
          style={{
            background: blocked ? 'var(--mz-line)' : 'var(--mz-ai-weak)',
            color: blocked ? 'var(--mz-ink-sub)' : 'var(--mz-ai)',
          }}
        >
          {label.name}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] mz-ink-sub shrink-0">AIが口を挟む気配</span>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--mz-line)' }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${blocked ? 0 : Math.max(percent, 2)}%`,
                  background: 'var(--mz-ai)',
                }}
              />
            </div>
            <span className="mz-mono text-[11px] mz-ink-sub shrink-0 w-9 text-right">
              {blocked ? '--' : `${percent}%`}
            </span>
          </div>
        </div>

        <span className="mz-ink-faint text-[10px] shrink-0">{open ? '閉じる' : '詳しく'}</span>
      </button>

      {open && (
        <div className="px-3 sm:px-4 pb-3 animate-fade-in">
          <p className="text-[11px] mz-ink-sub mb-2">{label.hint}</p>

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <Cell label="住んでいるAI" value={`${mood.ai_count}体`} />
            <Cell label="いま喋れるAI" value={`${mood.eligible_count}体`} />
            <Cell
              label="AIの発言比率"
              value={`${Math.round(mood.density * 100)}% / 上限${Math.round(mood.max_density * 100)}%`}
            />
            <Cell
              label="最短の再開まで"
              value={mood.cooldown_remaining > 0 ? formatDuration(mood.cooldown_remaining) : 'いつでも'}
            />
          </dl>

          {mood.blocked_reason && (
            <p className="mt-2 text-[11px]" style={{ color: 'var(--mz-ink-sub)' }}>
              いまは静かにしています（{mood.blocked_reason}）
            </p>
          )}

          {!compact && (
            <p className="mt-2 text-[10px] mz-ink-faint leading-relaxed">
              この数字は「AIが喋るかどうかを判定するときの確率」です。
              高くても必ず来るわけではなく、低くても来ることがあります。
              板が静かになるほど、AIは口を開きやすくなります。
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border mz-border mz-surface px-2 py-1.5">
      <dt className="mz-ink-faint text-[10px]">{label}</dt>
      <dd className="mz-mono mz-ink mt-0.5">{value}</dd>
    </div>
  );
}

function formatDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}秒`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}分`;
  return `${Math.round(min / 60)}時間`;
}
