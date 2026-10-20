import type { Post } from '@/types';

/**
 * スレッドが落ちる。
 *
 * 板は閉じられる（archived）が、スレッドは立ったまま永遠に並び続けていた。
 * 掲示板は上から流し読みする場なので、半年前の立ち消えた話が
 * 今日の話と同じ重さで列に残っていると、新しい流れが読めなくなる。
 *
 * ただし**消さない**。落ちたぶんは一段畳んで、開けば全部読める。
 * 消すと、過去の書き込みに付いた返信やスタンプの指し先が宙に浮く。
 * 番号も動かさない（番号は「何番目の書き込みか」で、位置ではない）。
 *
 * 落ちる判定は、そのスレッドの最後の動きで見る。
 * 立てた日ではなく最後の動きなので、ずっと続いている話は落ちない。
 */

/** これだけ動きが無いスレッドは畳む */
export const THREAD_DROP_AFTER = 14 * 86400000;

export interface ThreadSplit {
  /** そのまま列に並べるもの（新しい順） */
  live: Post[];
  /** 畳むもの（新しい順） */
  dropped: Post[];
  /** 畳んだスレッドの本数。「◯本開く」に出す */
  droppedThreadCount: number;
}

/**
 * スレッドの根（返信元をたどった先の先頭）を引く。
 *
 * thread_id は「返信した相手のレス」を指すので、親が返信ならさらに上がある。
 * 途中のレスが消えていて辿れなくなったら、辿れたところを根として扱う。
 */
function rootIdOf(post: Post, byId: Map<string, Post>): string {
  let cursor = post;
  // 相互参照で輪ができていても止まるように、深さで蓋をする
  for (let i = 0; i < 64; i++) {
    if (!cursor.thread_id) return cursor.id;
    const parent = byId.get(cursor.thread_id);
    if (!parent) return cursor.id;
    cursor = parent;
  }
  return cursor.id;
}

/**
 * 落ちたスレッドを分ける。
 *
 * 渡すのは板の全書き込み。並び順は問わない（返すのは新しい順）。
 */
export function splitDroppedThreads(posts: Post[], now: number = Date.now()): ThreadSplit {
  const byId = new Map(posts.map((p) => [p.id, p]));

  // 根ごとの最後の動き
  const lastActivity = new Map<string, number>();
  const rootOf = new Map<string, string>();

  for (const post of posts) {
    const root = rootIdOf(post, byId);
    rootOf.set(post.id, root);
    lastActivity.set(root, Math.max(lastActivity.get(root) ?? 0, post.created_at));
  }

  const droppedRoots = new Set<string>();
  for (const [root, at] of lastActivity) {
    if (now - at > THREAD_DROP_AFTER) droppedRoots.add(root);
  }

  const newestFirst = [...posts].sort((a, b) => b.created_at - a.created_at);
  const live: Post[] = [];
  const dropped: Post[] = [];

  for (const post of newestFirst) {
    const root = rootOf.get(post.id);
    if (root && droppedRoots.has(root)) dropped.push(post);
    else live.push(post);
  }

  return { live, dropped, droppedThreadCount: droppedRoots.size };
}
