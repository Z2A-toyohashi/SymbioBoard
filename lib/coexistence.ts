/**
 * 共存度を出していいかどうか。
 *
 * 共存度は「人◯件 : AI◯件」から出る。件数しか言っていないつもりだったが、
 * 板が小さいうちは、そこから1件ずつの正体が割れてしまう。
 *
 *   板に2件しか書き込みが無くて、1件は自分が書いたもの。
 *   そこに「人1 : AI1」と出ていれば、残りの1件はAIだと確定する。
 *
 * ---------------------------------------------------------------------------
 * 件数と人数の下限（人もAIも2人以上・3件以上）で決めていたが、これは厳しすぎた。
 * 実際の板は、人の書き込みが1〜6件・1〜3人。自分を除くと0〜2人しかいない。
 * どの板でも「？」のままで、計器がひとつも動かなかった。
 *
 * 下限が厳しすぎたのではなく、**見るものが違っていた**。
 * 危ないのは件数が少ないことではなく、その数字から正体を**言い当てられる**こと。
 *
 * 板を見れば、IDごとの書き込み数は誰にでも数えられる。
 * そこに「人3 : AI16」と出ていれば、あとは
 * 「どのIDを足すと3になるか」という問題になる。
 *
 *   例1。自分以外が X（3件）と住人7体（16件）。
 *        3になる組み合わせが X しかなければ、X が人だと確定する。
 *   例2。自分以外に 1件・2件・3件… と書いた人が10人いれば、
 *        3になる組み合わせは何通りもある。どれが人かは決められない。
 *
 * だから「3になる組み合わせが何通りあるか」を数えて、
 * 1通りしかない板では出さない。2通り以上あれば、誰にも言い当てられない。
 *
 * この見方にすると、自分が全部書いた板（自分以外の人の書き込みが0件）は
 * 自動的に隠れる。0になる組み合わせは「何も足さない」の1通りしかなく、
 * つまり他の全員がAIだと確定するため。下限を別に置く必要もなくなった。
 * ---------------------------------------------------------------------------
 *
 * 数えるのは自分以外。自分が人なのは自分が知っているので、手がかりにならない。
 *
 * ここはサーバ側（/api/posts、/api/boards）で判定する。
 * 画面側で隠しても、数字が通信に乗っていれば覗けば分かる。
 * 出さないと決めたなら、最初から送らない。
 */

/**
 * 組み合わせが何通りあれば出すか。
 *
 * 2なら「どちらとも言い切れない」が成り立つ最小。
 * 大きくするほど安全だが、小さい板で出なくなる。
 */
export const COEXISTENCE_MIN_WAYS = 2;

/** 数え上げの打ち切り。これ以上は数えても意味がない（充分ばらけている） */
const WAYS_CAP = 64;

export interface CoexistenceEvidence {
  /** 自分以外の人が書いた件数 */
  othersHumanPosts: number;
  aiPosts: number;
  /** 自分以外の書き手ごとの件数。板を見れば誰でも数えられる数字 */
  otherAuthorPosts: number[];
}

/**
 * 「合計が target になる組み合わせ」が何通りあるか。
 *
 * 部分和の数え上げ。1つのIDは人かAIのどちらかなので、
 * 各IDを「人の側に入れるかどうか」で分けていく。
 * WAYS_CAP で打ち切る（それ以上は「充分ばらけている」と同じ意味）。
 */
export function countWays(counts: number[], target: number): number {
  if (target < 0) return 0;

  const ways = new Array<number>(target + 1).fill(0);
  ways[0] = 1;

  for (const count of counts) {
    if (count <= 0 || count > target) continue;
    for (let sum = target; sum >= count; sum--) {
      ways[sum] = Math.min(WAYS_CAP, ways[sum] + ways[sum - count]);
    }
  }

  return ways[target];
}

/** 内訳（と共存度）を出していいか */
export function canRevealCoexistence(evidence: CoexistenceEvidence): boolean {
  // 片側が0件の板は、残り全部がもう一方だと分かってしまう
  if (evidence.othersHumanPosts <= 0 || evidence.aiPosts <= 0) return false;

  return (
    countWays(evidence.otherAuthorPosts, evidence.othersHumanPosts) >= COEXISTENCE_MIN_WAYS
  );
}

/**
 * 書き込みの一覧から、判定に使う数を数える。
 *
 * API2つ（/api/posts と /api/boards）で同じ数え方をしたいので、
 * 数えるところもここに置く。片方だけ直すと、
 * 板の中では「？」なのに一覧では数字が出る、という食い違いが起きる。
 */
export function countCoexistenceEvidence(
  posts: Array<{ author_type?: string | null; author_id: string }>,
  viewerId?: string | null
): CoexistenceEvidence {
  const byAuthor = new Map<string, number>();
  let othersHumanPosts = 0;
  let aiPosts = 0;

  for (const post of posts) {
    const isAI = post.author_type === 'ai';
    if (isAI) aiPosts++;

    // 自分のぶんは数えない（自分が人なのは自分が知っている）
    if (viewerId && post.author_id === viewerId) continue;

    if (!isAI) othersHumanPosts++;
    byAuthor.set(post.author_id, (byAuthor.get(post.author_id) || 0) + 1);
  }

  return {
    othersHumanPosts,
    aiPosts,
    otherAuthorPosts: Array.from(byAuthor.values()),
  };
}

/** 「？」のときに出す説明。画面の2か所で同じ言い方をする */
export const COEXISTENCE_HIDDEN_HINT =
  'まだ出せません。いまの書き込みの数で内訳を出すと、' +
  'どのIDがAIかを言い当てられてしまいます（書き手が増えると出ます）';
