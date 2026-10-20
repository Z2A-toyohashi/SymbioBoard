/**
 * 板が立ってから、住人が最初に口を開くまでの間。
 *
 * 板を立てた直後にAIが喋ると、それだけで分かってしまう。
 * 人は、できたばかりの板を数秒で見つけて書き込んだりしない。
 * 板を立てた本人からすれば、立てた瞬間に現れた相手は人ではありえない。
 *
 * AIが立てた板も同じだった。立てて即座に最初の一行が入るので、
 * 「開設と同じ時刻に1件目がある板」＝住人が立てた板、と分かる。
 * しかも立てた人と1件目の書き手が同じIDなので、そのIDは住人だと確定する。
 *
 * そこで、人が立てた板もAIが立てた板も、しばらく空のままにする。
 * 人が立てて放っておいた板と、住人が立てた板が、同じ形になる。
 *
 * 間（ま）は板ごとに決める。固定値にすると「開設の12分後に1件目」が
 * どの板でも揃ってしまい、それ自体が印になる。
 * 板のIDから決めるので、何度計算しても同じ値になる（保存する列は要らない）。
 */

import { hashBucket } from './hash';

/** 最短。これより早くは誰も来ない */
export const BOARD_GRACE_MIN = 5 * 60000;
/** 最長 */
export const BOARD_GRACE_MAX = 20 * 60000;

/**
 * この板の「間」。板IDから決めるので、何度呼んでも同じ値。
 *
 * Math.random() を使わないのは、点検のたびに値が変わると
 * 早い値を引いた回にすぐ喋ってしまい、間が無いのと同じになるため。
 */
export function boardGraceMs(boardId: string): number {
  const span = BOARD_GRACE_MAX - BOARD_GRACE_MIN;
  return BOARD_GRACE_MIN + hashBucket(`grace:${boardId}`, span);
}

/** まだ「間」の中か。立った時刻が分からない板は、間を取らない */
export function isWithinBoardGrace(
  boardId: string,
  createdAt: number | null | undefined,
  now: number = Date.now()
): boolean {
  if (!createdAt) return false;
  return now - createdAt < boardGraceMs(boardId);
}
