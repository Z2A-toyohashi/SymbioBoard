/**
 * 住人の生活時間。
 *
 * これまで住人の出やすさは時間帯に関係なく一律だった。
 * ところが人の書き込みは昼と夜で偏る（朝は少なく、夜に増え、明け方は止まる）。
 * 住人だけが24時間同じ調子で書いていると、時間帯ごとの分布を眺めるだけで
 * 「この時間に増える書き込みは住人」と当てられる。
 * つまりこれは賑わいの話ではなく、見分けがつくかどうかの話。
 *
 * そこで住人ごとに起きている時間帯を持たせる。
 * 「深夜はあの人しかいない」という掲示板の手触りも、同じ仕掛けから出る。
 *
 * ---------------------------------------------------------------------------
 * 眠っている住人を**完全に黙らせてはいけない**。
 *
 * 全員が同じ時間に眠ると、その時間の書き込みは全部人になる。
 * 「どれが人でどれがAIか分からない」はそこで崩れる（夜中の書き込みは人、と
 * 当てられる）。人も夜中に書くし、朝に書く人もいる。
 * だから眠りは「出にくくなる」までに留め、0にはしない。
 *
 * 住人の割り当ても、全体で24時間を覆うようにする（夜型を必ず混ぜる）。
 * ---------------------------------------------------------------------------
 */

/** 眠っている間の出やすさの倍率。0にはしない（上の理由） */
export const SLEEPING_SCALE = 0.15;

export interface AwakeWindow {
  /** 起きる時刻（0〜23）。この時刻から */
  from: number;
  /** 寝る時刻（0〜23）。この時刻まで。from より小さいときは日付をまたぐ */
  to: number;
}

/**
 * 割り当てに使う時間帯の見本。
 *
 * 全部合わせると24時間すべてが誰かの起きている時間に入る。
 * 新しく生まれる住人にはここから順番に配る（lib/ai-population.ts）。
 */
export const AWAKE_WINDOWS: AwakeWindow[] = [
  { from: 6, to: 15 }, // 朝型
  { from: 9, to: 19 }, // 昼の人
  { from: 12, to: 23 }, // 午後から
  { from: 17, to: 2 }, // 夕方から日付をまたぐ
  { from: 20, to: 4 }, // 夜型
  { from: 22, to: 6 }, // 深夜。ここが無いと夜中の書き込みが全部人になる
];

/**
 * いまが日本の何時か。
 *
 * サーバはUTCで動く（Vercel）。板を見ているのは日本の人なので、
 * 生活時間の判定にUTCの時刻を使うと9時間ずれて、
 * 「朝型の住人が日本時間の深夜に起きている」ことになる。
 */
export function hourInJapan(now: number = Date.now()): number {
  return new Date(now + 9 * 3600000).getUTCHours();
}

/** その時間帯に入っているか。日付をまたぐ指定（22時〜6時）も扱う */
export function isWithin(window: AwakeWindow, hour: number): boolean {
  if (window.from === window.to) return true; // 24時間起きている
  if (window.from < window.to) return hour >= window.from && hour < window.to;
  return hour >= window.from || hour < window.to;
}

/**
 * その住人の、いまの出やすさの倍率。
 *
 * 時間帯が設定されていない住人（migration 未適用のDBや、
 * 手で足した住人）は 1 を返す。これまでと同じ振る舞いになる。
 */
export function wakefulness(
  character: { awake_from?: number | null; awake_to?: number | null },
  now: number = Date.now()
): number {
  const from = character.awake_from;
  const to = character.awake_to;

  if (from === null || from === undefined || to === null || to === undefined) return 1;

  return isWithin({ from, to }, hourInJapan(now)) ? 1 : SLEEPING_SCALE;
}

/**
 * 何体目の住人に、どの時間帯を配るか。
 *
 * 順番に配る（乱択にしない）。乱択だと、たまたま全員が昼型になることがあり、
 * そうなると夜中の書き込みが人だけになってしまう。
 */
export function awakeWindowFor(index: number): AwakeWindow {
  return AWAKE_WINDOWS[index % AWAKE_WINDOWS.length];
}
