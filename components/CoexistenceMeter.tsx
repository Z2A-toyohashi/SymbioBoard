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
 * 件数は数えずに受け取る。
 *   以前はここで posts の author_type を数えていた。つまり画面側に
 *   「どれがAIか」が届いていたということで、通信を覗けば分かる状態だった。
 *   いまは /api/posts が件数だけを返し、印は落ちている。
 *
 * 計器は輪郭を太くして、画面の中で一番はっきりした物にしてある。
 * この数字がこの場の体温で、見に来る理由そのものなので、
 * 読み取りに手間がかからないほうがいい。
 *
 * 見立ては2つめの計器。「人だと思われた率」は人間側の自信の計器で、
 * 共存度（実際の混ざり具合）とは別のものを測っている。
 * 正解は永久に出ない（理由は app/api/guesses/route.ts）。
 */
interface CoexistenceMeterProps {
  /** 場の空気の判定に使う。人かAIかの印は入っていない */
  posts: Post[];
  humanCount: number;
  aiCount: number;
  /** 見立てのうち「人だと思う」の割合。まだ誰も押していなければ null */
  guessHumanRate?: number | null;
  guessTotal?: number;
}

export default function CoexistenceMeter({
  posts,
  humanCount,
  aiCount,
  guessHumanRate = null,
  guessTotal = 0,
}: CoexistenceMeterProps) {
  const rate = coexistenceRate(humanCount, aiCount);
  const label = SPACE_STATE_LABEL[detectSpaceState(posts)];

  return (
    <div
      className="mz-chrome sticky top-14 z-20 border-b"
      style={{ borderColor: 'var(--mz-line)', borderBottomWidth: 'var(--mz-border-w)' }}
      /* 読み上げには数字だけを渡す。棒も札も同じことを言っているので、
         飾りは読ませず、ここで一度だけ読ませる */
      role="img"
      aria-label={
        `共存度 ${rate}パーセント。人の書き込み${humanCount}件、AIの書き込み${aiCount}件。${label.name}` +
        (guessHumanRate !== null ? `。見立てでは${guessHumanRate}パーセントが人` : '')
      }
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

        {/*
          見立て。誰かが一度でも押していれば出す。
          「何人がそう思っているか」だけで、合っているかは出ない
        */}
        {guessHumanRate !== null && (
          <span
            className="mz-mono mz-ink-faint hidden shrink-0 text-[11px] tabular-nums sm:inline"
            title={`この板への見立て${guessTotal}件のうち、${guessHumanRate}%が「人だと思う」。答え合わせはありません`}
          >
            見立て {guessHumanRate}%
          </span>
        )}

        <span className="mz-chip mz-chip-quiet hidden shrink-0 sm:inline-flex">{label.name}</span>
      </div>
    </div>
  );
}
