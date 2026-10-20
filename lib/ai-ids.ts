import { supabase } from './supabase-client';

/**
 * 「このIDはAIか」を決める。
 *
 * これまでは ai_characters（住人の名簿）に居るかどうかだけで見ていた。
 * ところが管理画面から住人を消すと、名簿の行だけが消えて、
 * その住人の users の行・書き込み・記録は残る。
 * 残された側は名簿に居ないので、**人として数えられていた**。
 *
 * 実際にそうなっていた。消された住人のIDが訪問者の一覧に
 * 「訪問11回・書いた3件・板を開いた0回」で並んでいた。
 * 板を開かずに書くのは人にはできない動きで、見ればAIだと分かる。
 *
 * 数え違いは管理画面の見た目だけの問題ではない。
 * AIの人口は「いまいる人の数」から決まる（lib/ai-population.ts）ので、
 * 消された住人を人として数えると、その人数ぶん住人が増える。
 * AIがAIを呼ぶ形になり、場が一方的になっていく。
 *
 * そこで、名簿ではなく**実際に何を書いたか**で見る。
 *
 *   AI = ai_characters に居る ∪ AIとして書き込んだことがある
 *
 * posts.author_type は書いた時点で確定していて、後から消えない。
 * 名簿から消えても、書いたものは残る。
 *
 * ※ 本当は users に「AIか」の列を持たせるのが筋（毎回 posts を
 *   なめなくて済む）。それはマイグレーションが要るので、まずここで塞ぐ。
 */

/** posts を読む上限。これを超えるとAIのIDを取りこぼす */
const MAX_POSTS = 20000;

export async function loadAIIds(): Promise<Set<string>> {
  const [{ data: characters }, { data: aiPosts }] = await Promise.all([
    supabase.from('ai_characters').select('id'),
    supabase.from('posts').select('author_id').eq('author_type', 'ai').limit(MAX_POSTS),
  ]);

  const ids = new Set<string>();
  for (const row of characters || []) ids.add(row.id as string);
  for (const row of aiPosts || []) ids.add(row.author_id as string);

  return ids;
}

/**
 * 記録（logs）の行が、AIの行動か。
 *
 * IDの名簿とは別に、記録そのものにも印が残っている場合がある。
 *
 *   ・event_type が ai_ で始まるもの（住人の発言・画像・検索・スタンプ）
 *   ・古い post / reply の記録。昔はAIの書き込みも /api/posts を通っていて、
 *     metadata に author_type: 'ai' が入っている
 *
 * IDの判定をすり抜けた行をここでもう一度落とす。二重の網にしておく。
 */
export function isAIActivity(row: {
  event_type: string;
  metadata?: Record<string, unknown> | null;
}): boolean {
  if (row.event_type.startsWith('ai_')) return true;
  return (row.metadata || {}).author_type === 'ai';
}
