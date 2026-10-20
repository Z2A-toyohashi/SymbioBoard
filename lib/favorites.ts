'use client';

import { useCallback, useEffect, useState } from 'react';

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
 * 書けない環境（プライベートブラウジング等）では、その画面を開いている間だけ
 * 覚えている状態になる。読み書きは必ず try で囲む。
 */

const KEY = 'mz_favorite_boards';

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

/**
 * お気に入りの読み書き。
 *
 * 最初の描画では必ず空で始める。localStorage はサーバ側に無いので、
 * 初期値として読むと、描き出した内容と最初の描画が食い違う。
 */
export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setFavorites(read());
    setReady(true);
  }, []);

  const toggle = useCallback((boardId: string) => {
    setFavorites((prev) => {
      const next = prev.includes(boardId)
        ? prev.filter((id) => id !== boardId)
        : [...prev, boardId];
      write(next);
      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (boardId: string) => favorites.includes(boardId),
    [favorites]
  );

  return { favorites, isFavorite, toggle, ready };
}
