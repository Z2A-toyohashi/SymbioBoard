/**
 * 費用の見積もり。
 *
 * 「どのモデルにすると月いくらか」が分からないまま上限だけ動かすと、
 * 月末に請求で気づくことになる。設定画面でその場で出す。
 *
 * ここの単価は2026年10月時点の公表値をもとにした目安。
 * 改定されたら MODELS と IMAGE_PRICE を直す。実際の請求はOpenAIの
 * ダッシュボードで確認する。
 */

/** 1ドル何円で換算するか */
export const YEN_PER_USD = 150;

/** 1回の書き込みで使うおおよそのトークン数（場の説明＋板の文脈＋直近の書き込み） */
const INPUT_TOKENS_PER_POST = 1300;
const OUTPUT_TOKENS_PER_POST = 90;

/** web検索1回ぶんの、本文以外の往復 */
const SEARCH_INPUT_TOKENS = 1200;
const SEARCH_OUTPUT_TOKENS = 200;
/** 検索ツールの呼び出し料（1回あたり）。公表値が変わりやすいので目安 */
const SEARCH_CALL_USD = 0.01;

export interface ModelPrice {
  id: string;
  label: string;
  /** 100万トークンあたりの入力・出力（USD） */
  input: number;
  output: number;
  note: string;
}

export const MODELS: ModelPrice[] = [
  {
    id: 'gpt-4o-mini',
    label: 'gpt-4o-mini（最安）',
    input: 0.15,
    output: 0.6,
    note: '短い相槌なら十分。長めの文や板の文脈は取りこぼしやすい',
  },
  {
    id: 'gpt-4.1-mini',
    label: 'gpt-4.1-mini（標準）',
    input: 0.4,
    output: 1.6,
    note: '指示の守り方と文脈の拾い方が一段上。常用の既定',
  },
  {
    id: 'gpt-5-mini',
    label: 'gpt-5-mini',
    input: 0.25,
    output: 2.0,
    note: '考えてから書くぶん出力が増える。temperature などの細かい調整は効かない',
  },
  {
    id: 'gpt-4.1',
    label: 'gpt-4.1（高品質）',
    input: 2.0,
    output: 8.0,
    note: '人の書き込みと見分けがつきにくい。1日の上限は下げること',
  },
  {
    id: 'gpt-5',
    label: 'gpt-5（最上位）',
    input: 1.25,
    output: 10.0,
    note: '品質は最上位。細かい調整は効かず、費用は跳ね上がる',
  },
];

/** 画像1枚あたり（USD、1024×1024） */
export const IMAGE_PRICE: Record<string, Record<string, number>> = {
  'gpt-image-1': { low: 0.011, medium: 0.042, high: 0.167 },
  'dall-e-3': { low: 0.04, medium: 0.08, high: 0.08 },
};

/** 細かい調整（temperature など）が効かないモデルか */
export function isReasoningModel(model: string): boolean {
  return model.startsWith('gpt-5') || model.startsWith('o1') || model.startsWith('o3');
}

export interface CostInput {
  model: string;
  dailyBudget: number;
  imageModel: string;
  imageQuality: string;
  imageDailyBudget: number;
  searchDailyBudget: number;
}

export interface CostEstimate {
  /** 上限まで使い切った場合の1か月（30日）あたり */
  monthlyYen: number;
  textYen: number;
  imageYen: number;
  searchYen: number;
}

/** 上限まで使い切ったときの月額。実際はこれより少ない日が多い */
export function estimateMonthlyCost(input: CostInput): CostEstimate {
  const model = MODELS.find((m) => m.id === input.model) ?? MODELS[1];

  const perPost =
    (INPUT_TOKENS_PER_POST * model.input + OUTPUT_TOKENS_PER_POST * model.output) / 1_000_000;

  const perSearch =
    SEARCH_CALL_USD +
    (SEARCH_INPUT_TOKENS * model.input + SEARCH_OUTPUT_TOKENS * model.output) / 1_000_000;

  const perImage = IMAGE_PRICE[input.imageModel]?.[input.imageQuality] ?? 0.042;

  const text = perPost * input.dailyBudget * 30;
  const image = perImage * input.imageDailyBudget * 30;
  const search = perSearch * input.searchDailyBudget * 30;

  const yen = (usd: number) => Math.round(usd * YEN_PER_USD);

  return {
    monthlyYen: yen(text + image + search),
    textYen: yen(text),
    imageYen: yen(image),
    searchYen: yen(search),
  };
}
