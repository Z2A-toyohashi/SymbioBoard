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
 * 計器は輪郭を太くして、画面の中で一番はっきりした物にしてある。
 * この数字がこの場の体温で、見に来る理由そのものなので、
 * 読み取りに手間がかからないほうがいい。
 *
 * 算出はすべて画面側で行う。投稿はすでに手元にあるので、
 * 問い合わせを挟む理由がない。通信の都合で計器が消えることもなくなる。
 */
interface CoexistenceMeterProps {
  posts: Post[];
}

export default function CoexistenceMeter({ posts }: CoexistenceMeterProps) {
  const aiCount = posts.filter((p) => p.author_type === 'ai').length;
  const humanCount = posts.length - aiCount;
  const rate = coexistenceRate(humanCount, aiCount);
  const label = SPACE_STATE_LABEL[detectSpaceState(posts)];

  return (
    <div
      className="mz-chrome sticky top-14 z-20 border-b"
      style={{ borderColor: 'var(--mz-line)', borderBottomWidth: 'var(--mz-border-w)' }}
      /* 読み上げには数字だけを渡す。棒も札も同じことを言っているので、
         飾りは読ませず、ここで一度だけ読ませる */
      role="img"
      aria-label={`共存度 ${rate}パーセント。人の書き込み${humanCount}件、AIの書き込み${aiCount}件。${label.name}`}
    >
      <div className="mx-auto flex max-w-[1180px] items-center gap-2.5 px-3 py-2.5 sm:gap-4 sm:px-6">
        <span
          className="mz-display mz-ink-sub hidden shrink-0 text-[12px] font-bold tracking-[0.06em] sm:inline"
          title="人の書き込みとAIの書き込みが釣り合っているほど高くなります。半々で100、どちらか一方だけなら0"
        >
          共存度
        </span>

        <span className="mz-display mz-ink shrink-0 text-[22px] leading-none font-black tabular-nums">
          {rate}
          <span className="mz-ink-faint ml-0.5 text-[12px] font-bold">%</span>
        </span>

        {/* 太い輪郭の筒に、緑が溜まっていく */}
        <span
          className="relative h-[14px] min-w-0 flex-1 overflow-hidden"
          style={{
            background: 'var(--mz-surface)',
            border: 'var(--mz-border-w) solid var(--mz-line)',
            borderRadius: 'var(--mz-radius-pill)',
          }}
          aria-hidden
        >
          <span
            className="block h-full"
            style={{
              width: `${rate}%`,
              background: 'var(--mz-accent)',
              borderRadius: 'var(--mz-radius-pill)',
              transition: 'width 320ms ease-out',
            }}
          />
        </span>

        {/* 内訳。どれがAIかは分からないまま、混ざり具合だけが分かる */}
        <span className="mz-mono mz-ink-sub shrink-0 text-[12px] tabular-nums">
          人 {humanCount}
          <span className="mz-ink-faint mx-1">:</span>
          AI {aiCount}
        </span>

        <span className="mz-chip mz-chip-quiet hidden shrink-0 sm:inline-flex">{label.name}</span>
      </div>
    </div>
  );
}
