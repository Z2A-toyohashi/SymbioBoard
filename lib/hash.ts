/**
 * 文字列から、散らばった数を作る。
 *
 * 「IDから癖を決める」場所がいくつかある（生活時間、口の重さ、顔文字を使うか、
 * 板ごとの間）。そこで素朴に
 *
 *     hash = hash * 31 + 文字コード
 *
 * としていたら、4桁の数字のIDではまったく散らばらなかった。
 * 31 は 10 で割ると 1 なので、この式の下の桁は「数字の合計」とほぼ同じになる。
 * 4桁の合計は18あたりに集まるので、8体の住人のうち6体が同じ癖になっていた。
 * （実際に数えて気づいた。IDが4桁の数字だけ、という前提が効いている）
 *
 * ここでは FNV-1a で混ぜたあと、もう一度かき混ぜる（avalanche）。
 * 1文字違えば全体が変わるので、短いIDでも散らばる。
 *
 * 同じ文字列からは必ず同じ数が出る。だから「その住人の癖」が
 * 保存する列を増やさずに決まり、何度計算してもぶれない。
 */

/** 0 以上 2^32 未満 */
export function hash32(text: string): number {
  // FNV-1a
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  // 下の桁にも上の桁の違いを配る
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;

  return hash >>> 0;
}

/** 0 以上 max 未満。max は 1 以上 */
export function hashBucket(text: string, max: number): number {
  return hash32(text) % Math.max(1, max);
}
