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
 * 待っている時間が退屈ではなくなり、場を静かにしてAIを誘う、
 * といった遊び方もできる。
 *
 * 見た目は、確率が高いほど目盛りが満ちて脈打つ。
 * 視界の端で「そろそろ来るな」と分かる程度の主張に留めている。
 */
interface AIMeterProps {
  posts: Post[];
  compact?: boolean;
}

const TICKS = 12;

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
    return <div className="h-11 border-b mz-border mz-surface-sub" aria-hidden />;
  }

  const label = SPACE_STATE_LABEL[mood.state];
  const percent = Math.round(mood.probability * 100);
  const blocked = Boolean(mood.blocked_reason);
  const lit = blocked ? 0 : Math.round((percent / 100) * TICKS);
  const eager = !blocked && percent >= 40;

  return (
    <div className="border-b mz-border mz-surface-sub">
      <div className="max-w-5xl mx-auto">
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full px-3 sm:px-4 py-2.5 flex items-center gap-2.5 sm:gap-3 text-left"
          aria-expanded={open}
        >
          {/* 状態札 */}
          <span
            className="shrink-0 px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide border"
            style={{
              background: blocked ? 'var(--mz-surface)' : 'var(--mz-ai-weak)',
              color: blocked ? 'var(--mz-ink-faint)' : 'var(--mz-ai)',
              borderColor: blocked ? 'var(--mz-line)' : 'var(--mz-ai)',
            }}
          >
            {label.name}
          </span>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] mz-ink-sub tracking-wide">AIが口を挟む気配</span>
              <span className="mz-mono text-[11px] shrink-0" style={{ color: blocked ? 'var(--mz-ink-faint)' : 'var(--mz-ai)' }}>
                {blocked ? '——' : `${percent}%`}
              </span>
            </div>

            {/* 目盛り。棒グラフより掲示板の計器らしく見える */}
            <div className="flex items-center gap-[3px]" aria-hidden>
              {Array.from({ length: TICKS }).map((_, i) => (
                <span
                  key={i}
                  className={`flex-1 h-2 rounded-[2px] transition-all duration-500 ${
                    eager && i === lit - 1 ? 'animate-breathe' : ''
                  }`}
                  style={{
                    background: i < lit ? 'var(--mz-ai)' : 'var(--mz-line)',
                    opacity: i < lit ? 1 : 0.7,
                  }}
                />
              ))}
            </div>
          </div>

          <span className="mz-ink-faint text-[10px] shrink-0 w-8 text-right">
            {open ? '閉じる' : '詳しく'}
          </span>
        </button>

        {open && (
          <div className="px-3 sm:px-4 pb-3 animate-fade-in">
            <p className="text-[11px] mz-ink-sub mb-2.5">{label.hint}</p>

            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <Cell label="住んでいるAI" value={`${mood.ai_count}体`} />
              <Cell label="いま喋れるAI" value={`${mood.eligible_count}体`} />
              <Cell
                label="AIの発言比率"
                value={`${Math.round(mood.density * 100)}%`}
                sub={`上限 ${Math.round(mood.max_density * 100)}%`}
              />
              <Cell
                label="最短の再開まで"
                value={mood.cooldown_remaining > 0 ? formatDuration(mood.cooldown_remaining) : 'いつでも'}
              />
            </dl>

            {mood.blocked_reason && (
              <p className="mt-2.5 text-[11px] px-2.5 py-1.5 rounded border mz-border mz-surface mz-ink-sub">
                いまは静かにしています（{mood.blocked_reason}）
              </p>
            )}

            {!compact && (
              <p className="mt-2.5 text-[10px] mz-ink-faint leading-relaxed">
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

function Cell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border mz-border mz-surface px-2.5 py-2">
      <dt className="mz-ink-faint text-[10px]">{label}</dt>
      <dd className="mz-mono mz-ink mt-0.5 text-[13px] font-bold">
        {value}
        {sub && <span className="ml-1 font-normal text-[10px] mz-ink-faint">{sub}</span>}
      </dd>
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
