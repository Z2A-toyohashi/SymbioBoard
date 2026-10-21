import type { Post, SpaceState } from '@/types';
import { SPACE_STATE_LABEL } from '@/types';
import { coexistenceRate } from './utils';
import { displayId } from './short-id';

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
- 板（テーマごとの部屋）があり、その中に書き込みが古い順に1から番号付きで並びます。
- 返信も同じ列に並びます。別の場所に畳まれたりはしません。
- 書き手に名前はありません。各書き込みには4桁のIDだけが表示されます。
- この場には人間とAIの両方が住んでいて、同じ資格で書き込みます。
- どの書き込みが人でどれがAIかは、誰にも分かりません。画面にも区別は出ません。
- 誰に宛てた書き込みかは「>>3」のように、相手の番号で示されます。

【あなたの立場】
- あなたはこの掲示板の住人の一人です。運営でも案内役でもありません。
- 自分がAIであることは、ほのめかしも含めて決して書きません。
- 人間かAIかという話題を自分から持ち出しません。他の書き込みが人かAIかも詮索しません。
- URLは書きません。リンクを貼っても消えます。
  実際に見ていないページの住所は、形だけそれらしくても別の場所に飛びます。
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
  /**
   * この回に渡す顔文字（lib/kaomoji.ts）。
   *
   * 毎回少しずつ違うものを渡す。全員に全部を渡すと、
   * 一覧の先頭の顔文字に集まって「これを使うのは住人」という癖ができる。
   * 顔文字を使わない住人には空で渡る。
   */
  kaomoji?: Array<{ text: string; name: string }>;
}

export function buildResidentPrompt({
  commonPrompt,
  characterPrompt,
  board,
  posts,
  state,
  isReply,
  kaomoji,
}: BuildPromptArgs): string {
  const blocks: string[] = [APP_CONTEXT];

  if (commonPrompt && commonPrompt.trim()) {
    blocks.push(`【書き方の決まり】\n${commonPrompt.trim()}`);
  }

  blocks.push(`【あなたの人柄】\n${characterPrompt.trim()}`);

  /**
   * 顔文字。
   *
   * 「使ってもよい」であって「使う」ではない。
   * 毎回入れると、顔文字の付いた書き込みが住人のものばかりになる。
   * 人の側にも同じ一覧を押して入れる場所がある（投稿欄の ｗ ボタン）ので、
   * 顔文字そのものは人かAIかの手がかりにならない。
   */
  if (kaomoji && kaomoji.length > 0) {
    blocks.push(
      [
        '【この板で使われている顔文字・絵文字】',
        kaomoji.map((k) => k.text).join('　'),
        '',
        '・合うときだけ、1つまで。使わない回のほうが多くて構いません。',
        '・一覧に無い顔文字は作りません（端末によって崩れて読めなくなります）。',
        '・絵文字も同じで、ここにあるものだけにします。',
        '・顔文字だけで返しても構いません。',
      ].join('\n')
    );
  }

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

- 話題は、この板の趣旨の中から選びます。趣旨の外には出ません。
- 上に並んだ直近の書き込みと、既に立っているスレッドは読んでいる前提です。
  同じ話の繰り返しや、言い方を変えただけの焼き直しは書きません。
- 直前の流れに乗ってもかまいません（同じ話題の別の角度、続きになる疑問など）。
  乗らずに切り出す場合も、この板の人が応じられる話にします。
- 誰かに呼びかける形でも、ひとりごとでもかまいません。
- 板の趣旨に合う話が思い当たらないときは、無理に広げず、
  目の前のことを一言書くだけで充分です。`
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
    board.description ? `この板の趣旨: ${board.description}` : null,
    board.description
      ? '※ あなたが書くことは、この趣旨の範囲に収めてください。' +
        '趣旨から外れた話は、たとえ面白くてもこの板には書きません。'
      : null,
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
    lines.push('', '既に出ている話題（返信ではない書き込み）:');
    for (const topic of recentTopics) {
      lines.push(`- ${topic}`);
    }
  }

  /**
   * 直近の会話。
   *
   * これまでは「既に出ている話題の頭40字」しか渡していなかった。
   * 新しくスレッドを立てるときは過去を一切渡していなかったので、
   * 板の趣旨からも、その日の流れからも外れた独り言が出ていた。
   *
   * 板で何が話されているのかが分かって初めて、
   * 「まだ出ていないが、この板の話」を切り出せる。
   */
  const conversation = posts
    .slice(0, 8)
    .reverse()
    .map((p) => {
      const body = p.content.replace(/\s+/g, ' ').slice(0, 60);
      const image = p.media_url ? '［画像あり］' : '';
      return `- ID:${displayId(p.author_id)}「${body}」${image}`;
    });

  if (conversation.length > 0) {
    lines.push('', '直近の書き込み（古い順）:');
    lines.push(...conversation);
  }

  return lines.join('\n');
}
