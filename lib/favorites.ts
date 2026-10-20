'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * お気に入りの板。
 *
 * 置き場所はこの端末の中（localStorage）で、サーバには送らない。
 * 理由は2つある。
 *
 *   1. 「どの板をよく見るか」は、書き込みと違って場に出す必要がない情報。
 *      サーバに置けば、誰がどの板を気にしているかという記録が増える
 *   2. 押した瞬間に並びが変わってほしい。通信を挟むと、押してから
 *      一覧が組み替わるまでに間が空いて、押せたのかどうか分からない
 *
 * 引き継ぎコードで別の端末に移ってもお気に入りは付いてこない。
 * 板はいつでも一覧から探せるので、失っても手が止まらないものに留めている。
 *
 * ---------------------------------------------------------------------------
 * **状態はこのファイルの中に1つだけ持つ。**
 *
 * 最初は useState と useEffect で、呼んだ部品ごとに持っていた。
 * そうすると、一覧の星（FavoriteToggle）を押しても、
 * 並べ替えに使っている板一覧側の控えが古いままになる。
 * 星は黄色くなるのに「お気に入り」の面には出てこない、という状態になっていた。
 *
 * 置き場は外（localStorage）にあるのだから、Reactの状態として各部品に
 * 持たせるのが間違いだった。useSyncExternalStore で、
 * 全員が同じ1つを見るようにする。押した瞬間に、見ている全部が揃って変わる。
 * ---------------------------------------------------------------------------
 *
 * 書けない環境（プライベートブラウジング等）では、その画面を開いている間だけ
 * 覚えている状態になる。読み書きは必ず try で囲む。
 */

const KEY = 'mz_favorite_boards';

/**
 * サーバ側で描くときの中身。
 *
 * localStorage はサーバに無いので、必ず空で描く。
 * 実体を毎回新しく作らないのは、useSyncExternalStore が
 * 同じものかどうかを参照で見るため（作り直すと描き直しが止まらない）。
 *
 * この配列そのものが返ってきたかどうかで「まだ読めていない」も判る（ready）。
 */
const SERVER_EMPTY: string[] = [];

/** 読み込んだ控え。null は「まだ読んでいない」 */
let cache: string[] | null = null;

const listeners = new Set<() => void>();

/** 一覧の2つ目の面に出す順番を保つため、押した順で持つ */
function read(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
}

function write(ids: string[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // 書けなくても、画面の状態としては切り替わっている
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * いまのお気に入り。
 *
 * 同じ中身のときは同じ配列を返さなければならない（参照で比べられる）。
 * だから読み込みは一度だけで、変えるときだけ新しい配列に差し替える。
 */
function snapshot(): string[] {
  if (cache === null) cache = read();
  return cache;
}

function serverSnapshot(): string[] {
  return SERVER_EMPTY;
}

/** 入れる・外す。見ている全部の部品に伝わる */
export function toggleFavorite(boardId: string): void {
  const current = snapshot();
  const next = current.includes(boardId)
    ? current.filter((id) => id !== boardId)
    : [...current, boardId];

  cache = next;
  write(next);
  for (const listener of listeners) listener();
}

export function useFavorites() {
  const favorites = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  const isFavorite = useCallback(
    (boardId: string) => favorites.includes(boardId),
    [favorites]
  );

  return {
    favorites,
    isFavorite,
    toggle: toggleFavorite,
    /**
     * 手元の控えを読めたか。
     * サーバ側で描いた直後（まだ読めていない）は false になる。
     * ☆ で描いてから★に入れ替わると、押した覚えのない星が動いたように見える。
     */
    ready: favorites !== SERVER_EMPTY,
  };
}
