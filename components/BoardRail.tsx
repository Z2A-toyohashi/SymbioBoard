'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { BoardSummary } from '@/types';
import { useFavorites } from '@/lib/favorites';

/**
 * 板の袖。
 *
 * 広い画面で本文が中央に一本だけ立っていると、掲示板というより記事に見える。
 * 板を渡り歩けることが掲示板の中身なので、その導線を横に常駐させる。
 * 狭い画面では出さない。代わりに板名の横列（BoardTabs）を本文の上に置く。
 *
 * お気に入りは上に分けて置く。
 *   横列（BoardTabs）では場所が足りないので前に寄せるだけだが、
 *   こちらは縦に伸ばせるので、見出しを付けて区切ったほうが早く見つかる。
 *   入れる・外す操作は板の中（BoardTabs）と一覧（/）に置いてある。
 *   ここは渡り歩くための列なので、操作は混ぜない。
 */
export default function BoardRail({ currentBoardId }: { currentBoardId?: string }) {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const { favorites } = useFavorites();

  useEffect(() => {
    fetch('/api/boards')
      .then((r) => r.json())
      .then((d) => setBoards(d.boards || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const favored = useMemo(
    () =>
      favorites
        .map((id) => boards.find((b) => b.id === id))
        .filter((b): b is BoardSummary => Boolean(b)),
    [boards, favorites]
  );
  const rest = useMemo(
    () => boards.filter((b) => !favorites.includes(b.id)),
    [boards, favorites]
  );

  const Row = ({ board }: { board: BoardSummary }) => {
    const active = board.id === currentBoardId;
    return (
      <Link
        href={`/b/${board.id}`}
        aria-current={active ? 'page' : undefined}
        className="flex items-baseline gap-2 px-3 py-2.5 transition-colors"
        style={
          active
            ? {
                background: 'var(--mz-ink)',
                color: 'var(--mz-paper)',
                borderRadius: 'var(--mz-radius-pill)',
              }
            : { color: 'var(--mz-ink)', borderRadius: 'var(--mz-radius-pill)' }
        }
      >
        <span className={`truncate text-[13px] ${active ? 'font-bold' : ''}`}>{board.title}</span>
        <span
          className="mz-mono ml-auto shrink-0 text-[11px] tabular-nums"
          style={{ color: active ? 'var(--mz-paper)' : 'var(--mz-ink-faint)' }}
        >
          {board.post_count}
        </span>
      </Link>
    );
  };

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-32 pt-5">
        {favored.length > 0 && (
          <>
            <div className="mb-2 flex items-baseline px-1">
              <h2 className="mz-display mz-ink-sub text-[11px] font-bold tracking-[0.12em]">
                ★ お気に入り
              </h2>
            </div>
            <nav className="mb-4 space-y-0.5">
              {favored.map((board) => (
                <Row key={board.id} board={board} />
              ))}
            </nav>
          </>
        )}

        <div className="mb-2 flex items-baseline px-1">
          <h2 className="mz-display mz-ink-sub text-[11px] font-bold tracking-[0.12em]">板</h2>
          <Link href="/" className="mz-accent ml-auto text-[11px] hover:underline">
            一覧
          </Link>
        </div>

        <nav className="space-y-0.5">
          {loading &&
            // 来るものと同じ高さの影を先に置く。描き終わりに列が跳ねないようにする
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="px-2.5 py-2.5">
                <div className="mz-skeleton h-[13px]" style={{ width: `${70 - i * 8}%` }} />
              </div>
            ))}

          {!loading && rest.map((board) => <Row key={board.id} board={board} />)}

          {!loading && boards.length === 0 && (
            <p className="mz-ink-faint px-2.5 py-3 text-[12px]">まだ板がありません</p>
          )}
        </nav>

        <Link href="/" className="mz-btn mz-btn-sm mz-btn-quiet mt-3.5 w-full">
          板を立てる
        </Link>
      </div>
    </aside>
  );
}
