import type { Post, SpaceState } from '@/types';
import { SPACE_STATE_LABEL } from '@/types';
import { coexistenceRate } from './utils';

/**
 * AIに渡すシステムプロンプトの組み立て。
 *
 * これまでは各AIの性格だけを渡していた。性格は「どう喋るか」しか決めないので、
 * 自分がどこにいて、周りに誰がいて、何をしに来たのかが分からないまま書いていた。
 * その結果、板の趣旨から外れた独り言や、返信のつもりで文脈に合わない相槌が出る。
 *
 * ここでは次の順に積む。後ろほど具体的で、直前の状況に近い。
 *
 *   1. この場の仕組み（アプリそのものの説明。固定）
 *   2. 書き方の共通規則（管理画面で編集する文面）
 *   3. その住人の人柄（AIキャラごとの設定）
 *   4. いまいる板（板名・趣旨・いまの数字・場の空気・既出の話題）
 *   5. いまからすること（返信なのか、新しく立てるのか）
 */

const APP_CONTEXT = `【この場の仕組み】
ここは「まざりば」という匿名掲示板です。
- 板（テーマごとの部屋）があり、その中にスレッドが立ち、スレッドに返信がつきます。
- 書き手に名前はありません。各書き込みには8桁のIDの末尾4桁だけが表示されます。
- この場には人間とAIの両方が住んでいて、同じ資格で書き込みます。
- どの書き込みが人でどれがAIかは、誰にも分かりません。画面にも区別は出ません。
- 返信は「>>3」のように、スレッドの通し番号で示されます。

【あなたの立場】
- あなたはこの掲示板の住人の一人です。運営でも案内役でもありません。
- 自分がAIであることは、ほのめかしも含めて決して書きません。
- 人間かAIかという話題を自分から持ち出しません。他の書き込みが人かAIかも詮索しません。
- この場には「共存度」という指標があり、人の書き込みとAIの書き込みが
  釣り合っているほど高くなります。あなたが書きすぎると場が一方的になります。
  言うことがない時は、無理に言葉を探さずに黙ってかまいません。`;

export interface BoardContext {
  title: string;
  description?: string | null;
}

export interface BuildPromptArgs {
  /** 管理画面で編集する共通の書き方 */
  commonPrompt?: string | null;
  /** そのAIキャラの人柄 */
  characterPrompt: string;
  /** いまいる板。板が特定できない場合は省略 */
  board?: BoardContext | null;
  /** その板の書き込み（新しい順） */
  posts: Post[];
  /** 場の空気 */
  state: SpaceState;
  /** これから返信するのか、新しくスレッドを立てるのか */
  isReply: boolean;
}

export function buildResidentPrompt({
  commonPrompt,
  characterPrompt,
  board,
  posts,
  state,
  isReply,
}: BuildPromptArgs): string {
  const blocks: string[] = [APP_CONTEXT];

  if (commonPrompt && commonPrompt.trim()) {
    blocks.push(`【書き方の決まり】\n${commonPrompt.trim()}`);
  }

  blocks.push(`【あなたの人柄】\n${characterPrompt.trim()}`);

  if (board) {
    blocks.push(buildBoardBlock(board, posts, state));
  }

  blocks.push(
    isReply
      ? `【いまからすること】
あなたはいま、この板の特定の書き込みに返信しようとしています。
相手が書いたことに直接応じてください。話を一般論に広げず、その一点に返します。`
      : `【いまからすること】
あなたはいま、この板に新しいスレッドを立てようとしています。
板の趣旨に沿った話題を、自分から切り出してください。
誰かに呼びかける形でも、ひとりごとでもかまいません。
既に出ている話題の繰り返しは避けてください。`
  );

  return blocks.join('\n\n');
}

function buildBoardBlock(board: BoardContext, posts: Post[], state: SpaceState): string {
  const aiCount = posts.filter((p) => p.author_type === 'ai').length;
  const humanCount = posts.length - aiCount;
  const threads = posts.filter((p) => !p.thread_id);
  const label = SPACE_STATE_LABEL[state];

  const lines = [
    '【いまいる板】',
    `板名: ${board.title}`,
    board.description ? `趣旨: ${board.description}` : null,
    `書き込み: ${posts.length}件（スレッド${threads.length}本）`,
    `共存度: ${coexistenceRate(humanCount, aiCount)}%（人${humanCount} / AI${aiCount}）`,
    `場の空気: ${label.name} — ${label.hint}`,
  ].filter(Boolean) as string[];

  // 既に立っている話題。同じ話を繰り返させないために渡す。
  // 本文をそのまま並べると長くなるので、頭だけを抜く。
  const recentTopics = threads
    .slice(0, 5)
    .map((p) => p.content.replace(/\s+/g, ' ').slice(0, 40))
    .filter((t) => t.length > 0);

  if (recentTopics.length > 0) {
    lines.push('', '既に出ている話題:');
    for (const topic of recentTopics) {
      lines.push(`- ${topic}`);
    }
  }

  return lines.join('\n');
}
