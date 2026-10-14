'use client';

import { useEffect, useState } from 'react';
import type { AIMood, Post } from '@/types';
import { SPACE_STATE_LABEL } from '@/types';

/**
 * ざわめきメーター
 *
 * このアプリの面白さは「AIがいつ口を挟んでくるか分からない」ところにある。
 * ただ、何も見えないとAIが黙っているのか壊れているのか区別がつかない。
 * かといって「次は3分後に投稿します」と確定で出すと、驚きが消える。
 *
 * そこで出すのは確率と空気の状態だけにした。
 * 「いまAIは入りたがっている」までは分かるが、実際に来るかは分からない。
 *
 * 見た目は計器に寄せている。脈打たせたり色を散らしたりすると、
 * 数字そのものより演出が目に入ってしまう。
 */
interface AIMeterProps {
  posts: Post[];
  compact?: boolean;
}

const TICKS = 20;

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
    return <div className="h-9 border-b mz-border mz-surface-sub" aria-hidden />;
  }

  const label = SPACE_STATE_LABEL[mood.state];
  const percent = Math.round(mood.probability * 100);
  const blocked = Boolean(mood.blocked_reason);
  const lit = blocked ? 0 : Math.round((percent / 100) * TICKS);

  return (
    <div className="border-b mz-border mz-surface-sub">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full px-3 sm:px-4 py-2 flex items-center gap-3 text-left"
          aria-expanded={open}
        >
          <span className="shrink-0 text-[11px] mz-ink-sub">場の空気</span>

          <span
            className="shrink-0 text-[12px] font-bold"
            style={{ color: blocked ? 'var(--mz-ink-faint)' : 'var(--mz-ai)' }}
          >
            {label.name}
          </span>

          {/* 目盛り。角も丸めず、色も一色 */}
          <span className="flex items-center gap-px shrink-0" aria-hidden>
            {Array.from({ length: TICKS }).map((_, i) => (
              <span
                key={i}
                className="w-1 h-3"
                style={{ background: i < lit ? 'var(--mz-ai)' : 'var(--mz-line)' }}
              />
            ))}
          </span>

          <span
            className="mz-mono text-[12px] shrink-0"
            style={{ color: blocked ? 'var(--mz-ink-faint)' : 'var(--mz-ai)' }}
          >
            {blocked ? '——' : `${percent}%`}
          </span>

          <span className="text-[10px] mz-ink-faint ml-auto shrink-0">
            {open ? '閉じる' : 'AIが口を挟む確率'}
          </span>
        </button>

        {open && (
          <div className="px-3 sm:px-4 pb-3 animate-fade-in">
            <p className="text-[11px] mz-ink-sub mb-2 pb-2 border-b mz-border">{label.hint}</p>

            <dl className="divide-y mz-border border-y mz-border">
              <Row label="住んでいるAI" value={`${mood.ai_count}体`} />
              <Row label="いま喋れるAI" value={`${mood.eligible_count}体`} />
              <Row
                label="AIの発言比率"
                value={`${Math.round(mood.density * 100)}%（上限 ${Math.round(mood.max_density * 100)}%）`}
              />
              <Row
                label="最短の再開まで"
                value={mood.cooldown_remaining > 0 ? formatDuration(mood.cooldown_remaining) : 'いつでも'}
              />
              {mood.blocked_reason && <Row label="いまの状態" value={mood.blocked_reason} />}
            </dl>

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
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-1.5">
      <dt className="text-[11px] mz-ink-sub">{label}</dt>
      <dd className="mz-mono text-[12px] mz-ink">{value}</dd>
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
