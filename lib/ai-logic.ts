import type { Post, SpaceState } from '@/types';

/**
 * 場の空気を見る。
 *
 * 書き込みの間隔と返事の有無だけで決める。書き手が人かAIかは見ない。
 * ここで人/AIを数えると、画面に出す札（にぎやか・しずか…）から
 * 書き手の正体が透けることになる。
 *
 * このファイルには以前、固定文で返事を作る generateAIResponse と、
 * 介入を決める shouldAIIntervene があったが、どちらも呼ばれていなかった。
 * いまは住人の発言はすべて lib/ai-speak.ts が決めてGPTが書く。
 * 「わかる」「それな」のような固定文の一覧を残しておくと、
 * 生成に失敗したときの逃げ道として使われ、
 * 住人だけが同じ相槌を返す癖になる（＝IDから住人が割れる）ので消した。
 */
export function detectSpaceState(posts: Post[]): SpaceState {
  if (posts.length === 0) return 'SILENCE';

  const now = Date.now();
  const recentPosts = posts.filter((p) => now - p.created_at < 300000); // 5分以内

  // FLOW: 5分以内に3件以上の投稿
  if (recentPosts.length >= 3) return 'FLOW';

  const lastPost = posts[0]; // 最新の投稿
  const timeSinceLastPost = now - lastPost.created_at;

  // SILENCE: 5分以上投稿なし
  if (timeSinceLastPost > 300000) return 'SILENCE';

  // SOLO: 返信がない投稿（1分以上経過）
  const hasReplies = posts.some((p) => p.thread_id === lastPost.id);
  if (!hasReplies && timeSinceLastPost > 60000 && !lastPost.thread_id) {
    return 'SOLO';
  }

  // FRAGILE: その他
  return 'FRAGILE';
}
