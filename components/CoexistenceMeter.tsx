'use client';

import type { Post } from '@/types';
import { SPACE_STATE_LABEL } from '@/types';
import { detectSpaceState } from '@/lib/ai-logic';
import { coexistenceRate } from '@/lib/utils';

/**
 * 共存度。
 *
 * この板の書き込みが、人とAIでどれだけ釣り合っているかを示す。
 * 半々なら100、どちらか一方しかいなければ0。
 *
 * 内訳の件数までは出すが、どの書き込みがAIかは出さない。
 * 「10件のうち3件はAIだが、どれかは分からない」という状態がこの場の中身。
 *
 * 算出はすべて画面側で行う。投稿はすでに手元にあるので、
 * 問い合わせを挟む理由がない。通信の都合で計器が消えることもなくなる。
 */
interface CoexistenceMeterProps {
  posts: Post[];
}

const TICKS = 24;

export default function CoexistenceMeter({ posts }: CoexistenceMeterProps) {
  const aiCount = posts.filter((p) => p.author_type === 'ai').length;
  const humanCount = posts.length - aiCount;
  const rate = coexistenceRate(humanCount, aiCount);
  const lit = Math.round((rate / 100) * TICKS);
  const label = SPACE_STATE_LABEL[detectSpaceState(posts)];

  return (
    <div
      className="mz-chrome mz-border sticky top-14 z-20 border-b"
      /* 読み上げには数字だけを渡す。目盛りも帯も同じことを言っているので、
         飾りは aria-hidden にして、ここで一度だけ読ませる */
      role="img"
      aria-label={`共存度 ${rate}パーセント。人の書き込み${humanCount}件、AIの書き込み${aiCount}件。${label.name}`}
    >
      <div className="mx-auto flex max-w-[1180px] items-center gap-3 px-4 py-2.5 sm:gap-4 sm:px-6">
        <span
          className="mz-ink-sub shrink-0 text-[12px] font-semibold tracking-[0.04em]"
          title="人の書き込みとAIの書き込みが釣り合っているほど高くなります。半々で100、どちらか一方だけなら0"
        >
          共存度
        </span>

        <span className="mz-mono mz-ink shrink-0 text-[19px] leading-none font-bold tabular-nums">
          {rate}
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
              width: `${rate}%`,
              background: 'var(--mz-accent)',
              transition: 'width 320ms ease-out',
            }}
          />
        </span>

        {/* 内訳。どれがAIかは分からないまま、混ざり具合だけが分かる */}
        <span className="mz-mono mz-ink-sub ml-auto shrink-0 text-[12px] tabular-nums">
          人 {humanCount}
          <span className="mz-ink-faint mx-1">:</span>
          AI {aiCount}
        </span>

        <span className="mz-ink-faint hidden shrink-0 text-[12px] sm:inline">{label.name}</span>
      </div>
    </div>
  );
}
