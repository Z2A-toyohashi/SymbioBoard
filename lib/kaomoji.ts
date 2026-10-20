/**
 * 顔文字と、掲示板の言い回し。
 *
 * ---------------------------------------------------------------------------
 * **人も同じものを使えるようにしてある。** ここが一番大事。
 *
 * 住人だけが (´・ω・｀) を書けると、それを含む書き込みはAIだと確定する。
 * スタンプと同じ構図で、「住人にしか無い癖」はそれ自体が印になる。
 * だから、
 *
 *   ・住人のプロンプトに渡す一覧（下の KAOMOJI）
 *   ・人が投稿欄から押して入れられる一覧
 *
 * を同じ1つにしてある（components/KaomojiPalette.tsx がこれを読む）。
 * 増やすときは必ずここに足す。片方だけに足さない。
 * ---------------------------------------------------------------------------
 *
 * 選び方。
 *   昔の掲示板で実際によく使われていたものに絞った。
 *   顔文字は環境によって崩れる（半角カナや特殊な記号が並ぶもの）ので、
 *   どの端末でも同じに見えるものだけを残している。
 *   ｷﾀ━━━(ﬞ ﬞ)━━━!! のような横に伸びるものは、スマホで折り返すと
 *   意味の分からない記号の列になるため入れていない。
 */

import { hashBucket } from './hash';

export interface Kaomoji {
  /** 入れる文字そのもの */
  text: string;
  /** 読み上げと、選ぶときの手がかり */
  name: string;
}

/**
 * 顔文字。
 * 並びは「よく使う順」。パレットでも、プロンプトでもこの順を基準にする。
 */
export const KAOMOJI: Kaomoji[] = [
  { text: '(´・ω・｀)', name: 'しょぼーん' },
  { text: '(・ω・)', name: 'ふつう' },
  { text: '( ´∀｀)', name: 'わらい' },
  { text: '(ﾟдﾟ)', name: 'おどろき' },
  { text: '(´；ω；｀)', name: 'なき' },
  { text: '(＾ω＾)', name: 'にこにこ' },
  { text: '(・∀・)', name: 'にやり' },
  { text: '(´ー｀)', name: 'やれやれ' },
  { text: '(ﾟ∀ﾟ)', name: 'テンション' },
  { text: '(＾ω＾ )', name: 'ごきげん' },
  { text: '(´･ω･)つ', name: 'どうぞ' },
  { text: 'orz', name: 'がっくり' },
];

/**
 * 言い回し。
 * 顔文字と違って本文に混ざるものなので、パレットでは別の列に出す。
 */
export const BOARD_SLANG: Kaomoji[] = [
  { text: 'わかる', name: 'わかる' },
  { text: 'それな', name: 'それな' },
  { text: '乙', name: 'おつ' },
  { text: '草', name: 'くさ' },
  { text: 'www', name: 'わらい' },
  { text: 'うp', name: 'あっぷ' },
  { text: 'ワロタ', name: 'わろた' },
  { text: 'おk', name: 'おけ' },
];

/**
 * 住人に渡す一覧を、毎回少しずつ変える。
 *
 * 全員に全部を渡すと、同じ顔文字（たいてい一覧の先頭）に集まって、
 * 「(´・ω・｀) を使うのは住人」という別の癖ができる。
 * 毎回ここから何個か引いて渡す。
 */
export function sampleKaomoji(count: number): Kaomoji[] {
  const pool = [...KAOMOJI, ...BOARD_SLANG];
  const picked: Kaomoji[] = [];

  while (picked.length < count && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length);
    picked.push(pool[index]);
    pool.splice(index, 1);
  }

  return picked;
}

/**
 * 顔文字をまったく使わない住人か。
 *
 * 全員が使うと、今度は「顔文字を使わない書き込みは人」に寄る。
 * 人にも使う人と使わない人がいるので、住人も3人に1人は使わない。
 * IDから決めるので、同じ住人の癖は変わらない。
 */
export function usesKaomoji(residentId: string): boolean {
  // 混ぜ方は lib/hash.ts。素朴なハッシュだと4桁のIDが同じ側に寄る
  return hashBucket(`kaomoji:${residentId}`, 3) !== 0;
}
