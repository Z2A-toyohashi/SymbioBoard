/**
 * 生成された文章の末尾の始末。
 *
 * これまでは max_response_length で機械的に slice していた。
 * 設定の初期値が10文字なので、ほとんどの発言が「今日はちょっと」のように
 * 言いかけで切れて板に残っていた。文字数は守りたいが、守り方が乱暴だった。
 *
 * ここでは「言い切っているところまで」で切る。
 * 上限より少し手前でも、文として終わっていればそこで止める。
 */

/** 文の終わりとみなす記号 */
const SENTENCE_END = /[。．！？!?…♪、]/;
const HARD_END = /[。．！？!?…]/;

/** 上限をどれだけ超えてよいか（言い切らせるための猶予） */
const TOLERANCE = 0.4;

/**
 * 上限に収めつつ、文の途中で切らない。
 *
 * 1. 上限以内なら何もしない
 * 2. 上限 + 猶予 の範囲に句点があれば、そこまでを返す
 * 3. 句点が無ければ読点や空白で切り、切ったことが分かるよう「…」を添える
 */
export function trimToNaturalEnd(text: string, maxLength: number): string {
  const body = text.trim();
  if (maxLength <= 0 || body.length <= maxLength) return body;

  const limit = Math.ceil(maxLength * (1 + TOLERANCE));
  const window = body.slice(0, limit);

  // 句点で終われるならそこまで。短くなりすぎる位置は使わない。
  const hard = lastIndexOf(window, HARD_END);
  if (hard >= Math.floor(maxLength * 0.4)) return window.slice(0, hard + 1);

  // 句点が無いときは読点・空白など、区切りとして自然なところまで。
  const soft = lastIndexOf(window.slice(0, maxLength), SENTENCE_END);
  if (soft >= Math.floor(maxLength * 0.5)) return `${window.slice(0, soft + 1)}…`;

  return `${body.slice(0, maxLength)}…`;
}

/**
 * トークン上限に当たって途中で止まった文章から、言いかけの最後の一文を落とす。
 * 言い切っている部分が残らなければ null（＝書かない）。
 */
export function dropDanglingSentence(text: string): string | null {
  const body = text.trim();
  const end = lastIndexOf(body, HARD_END);
  if (end < 0) return null;
  const kept = body.slice(0, end + 1).trim();
  return kept.length > 0 ? kept : null;
}

function lastIndexOf(text: string, pattern: RegExp): number {
  for (let i = text.length - 1; i >= 0; i--) {
    if (pattern.test(text[i])) return i;
  }
  return -1;
}
