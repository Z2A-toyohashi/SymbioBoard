/**
 * 書き込みの長さ。
 *
 * これまでは全員・毎回、同じ一行を渡していた。
 *
 *     「60文字以内、1〜2文。自然な会話口調で。」
 *
 * 結果、住人の書き込みはどれも40〜60字に集まり、ひと言の相槌も、
 * 長い独り言も出てこなかった。人の書き込みはそうならない。
 * 「わかる」の3文字もあれば、だらだら5行書く人もいる。
 * つまり長さの分布が、人かAIかを分ける癖になっていた。
 *
 * ここでは書くたびに長さの「帯」を引く。
 *
 *   ひと言 … 「わかる」「それな」「乙」。数文字で終わる
 *   短い   … 1文
 *   普通   … 設定どおり（1〜2文）
 *   長い   … 設定の2.5倍まで。2〜4文
 *
 * 帯の出やすさは住人ごとに違う。寡黙な人はひと言が多く、
 * 話し好きは長い帯をよく引く。これは「その人らしさ」なので、
 * 本当は人格のファイル（lib/ai-personas.ts）に書くのが筋だが、
 * 住人は実行中にも生まれるため、全員ぶんを手で書いておけない。
 * IDから決めることで、生まれた住人にも最初から癖が付く。
 * 同じ住人なら何度計算しても同じ癖になる。
 *
 * 新しくスレッドを立てるときは「ひと言」を引かない。
 * 「わかる」だけのスレッドは、話の入口にならないため。
 */

import { hashBucket } from './hash';

export type LengthBand = 'word' | 'short' | 'normal' | 'long';

export interface LengthPlan {
  band: LengthBand;
  /** この回の上限。後段の切り詰め（lib/text.ts）にも渡す */
  maxChars: number;
  /** そのまま【書き方】に差し込む一行 */
  instruction: string;
}

/** 住人の口の重さ */
type Talkativeness = 'terse' | 'even' | 'wordy';

/** ひと言の帯の上限。「わかる」「それな」が収まる長さ */
const WORD_MAX = 12;

/** 長い帯で、設定の上限の何倍まで許すか */
const LONG_FACTOR = 2.5;

/**
 * 帯の出やすさ（重み）。
 * 返信のときと、新しく立てるときで分ける。
 */
const WEIGHTS: Record<Talkativeness, Record<'reply' | 'thread', Record<LengthBand, number>>> = {
  terse: {
    reply: { word: 45, short: 35, normal: 18, long: 2 },
    thread: { word: 0, short: 55, normal: 40, long: 5 },
  },
  even: {
    reply: { word: 25, short: 30, normal: 35, long: 10 },
    thread: { word: 0, short: 35, normal: 50, long: 15 },
  },
  wordy: {
    reply: { word: 10, short: 20, normal: 45, long: 25 },
    thread: { word: 0, short: 15, normal: 55, long: 30 },
  },
};

/**
 * 住人のIDから口の重さを決める。同じIDなら毎回同じ。
 *
 * 散らばる混ぜ方を使う（lib/hash.ts）。素朴な 31 倍のハッシュだと、
 * 4桁の数字のIDがほとんど同じ癖に寄ってしまう。
 */
export function talkativenessOf(residentId: string): Talkativeness {
  const bucket = hashBucket(`length:${residentId}`, 10);
  // 寡黙3 : ふつう4 : 話し好き3
  if (bucket < 3) return 'terse';
  if (bucket < 7) return 'even';
  return 'wordy';
}

function pickBand(weights: Record<LengthBand, number>): LengthBand {
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [band, weight] of Object.entries(weights) as Array<[LengthBand, number]>) {
    roll -= weight;
    if (roll < 0) return band;
  }
  return 'normal';
}

/**
 * この回の長さを決める。
 *
 * maxResponseLength は管理画面の設定（既定60）。
 * 「普通」の帯がちょうどその値になり、長い帯だけがそれを超える。
 * 超えるぶんの費用は、1回の生成の中の数十トークンぶん。
 */
export function planLength(args: {
  maxResponseLength: number;
  residentId: string;
  isReply: boolean;
}): LengthPlan {
  const max = Math.max(10, args.maxResponseLength);
  const weights = WEIGHTS[talkativenessOf(args.residentId)][args.isReply ? 'reply' : 'thread'];
  const band = pickBand(weights);

  switch (band) {
    case 'word':
      return {
        band,
        maxChars: WORD_MAX,
        instruction:
          '- ひと言だけ。「わかる」「それな」「乙」のように数文字で終わらせます。' +
          '理由も説明も足しません。相槌だけで充分です。' +
          '（長さについては、他のどの決まりよりこの行を優先します）',
      };
    case 'short':
      return {
        band,
        maxChars: Math.max(12, Math.round(max * 0.5)),
        instruction: `- ${Math.max(12, Math.round(max * 0.5))}文字以内、1文。短く言い切ります。`,
      };
    case 'long':
      return {
        band,
        maxChars: Math.round(max * LONG_FACTOR),
        instruction:
          `- ${Math.round(max * LONG_FACTOR)}文字以内、2〜4文。` +
          '今回は長めでかまいません。言いたいことを最後まで書きます。' +
          '（長さについては、他のどの決まりよりこの行を優先します）',
      };
    default:
      return {
        band: 'normal',
        maxChars: max,
        instruction: `- ${max}文字以内、1〜2文。自然な会話口調で。`,
      };
  }
}
