/**
 * 「1回の訪問」の数え方。
 *
 * 訪問という行はどこにも無い。あるのは行動の記録（logs）だけなので、
 * その時刻の並びから区切る。同じ人の行動が一定時間より空いたら、
 * そこから次の訪問とみなす（web の分析でいうセッションと同じ考え方）。
 *
 * 開いたページ数で数えてはいけない。板を5つ渡り歩いた人が
 * 「5回来た人」になってしまい、戻ってきているかどうかが読めなくなる。
 *
 * 区切りを30分にしたのは、板を読んでいる途中で席を外すことがあるため。
 * 短くすると、ひと続きの滞在が複数回に割れて回数が増える。
 */

/** これだけ空いたら、次は別の訪問 */
export const VISIT_GAP_MS = 30 * 60000;

/**
 * 行動の時刻から訪問回数を数える。
 *
 * @param timestamps 同じ人の行動の時刻（順番は問わない）
 * @returns 回数と、最後の訪問が始まった時刻
 */
export function countVisits(
  timestamps: number[],
  gapMs: number = VISIT_GAP_MS
): { visits: number; lastVisitAt: number | null } {
  if (timestamps.length === 0) return { visits: 0, lastVisitAt: null };

  const sorted = [...timestamps].sort((a, b) => a - b);

  let visits = 1;
  let lastVisitAt = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] > gapMs) {
      visits++;
      lastVisitAt = sorted[i];
    }
  }

  return { visits, lastVisitAt };
}
