'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { BoardSummary } from '@/types';
import { useFavorites } from '@/lib/favorites';
import FavoriteToggle from './FavoriteToggle';

/**
 * 板の横列（狭い画面だけ）。
 *
 * 広い画面には板の袖（BoardRail）があるのに、スマホには何も無かった。
 * 別の板へ行くには「← 板一覧」で戻ってから選び直すしかなく、
 * 掲示板の中身である「板を渡り歩く」動きが、スマホでは二手かかっていた。
 *
 * 横に流れる列にして、いま居る板を先頭付近に寄せておく。
 * 板名だけを出す。件数まで出すと一つが大きくなって、2つしか見えない。
 *
 * 並びはお気に入りが先。
 *   板が増えると、よく見る板が列の奥に流れていく（並びは「動きの新しい順」で、
 *   自分がよく見るかどうかとは関係ない）。お気に入りを前に出せば、
 *   何本あっても最初の数本に自分の板が来る。
 *
 * 列の頭には、いま居る板をお気に入りに入れる操作を置く。
 * 板の中に居るときが「また来たい」と思う瞬間なので、一覧に戻らず押せる場所に要る。
 */
export default function BoardTabs({
  currentBoardId,
  userId,
}: {
  currentBoardId?: string;
  userId?: string;
}) {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const activeRef = useRef<HTMLAnchorElement>(null);
  // 並びに使うだけ。出し入れは FavoriteToggle が持つ
  const { favorites, isFavorite } = useFavorites();

  useEffect(() => {
    fetch('/api/boards')
      .then((r) => r.json())
      .then((d) => setBoards(d.boards || []))
      .catch(() => {});
  }, []);

  // お気に入りが先、そのあとは元の並び（動きの新しい順）
  const ordered = useMemo(() => {
    const favored = favorites
      .map((id) => boards.find((b) => b.id === id))
      .filter((b): b is BoardSummary => Boolean(b));
    const rest = boards.filter((b) => !favorites.includes(b.id));
    return [...favored, ...rest];
  }, [boards, favorites]);

  // いま居る板が列の外に居ると、自分がどこに居るのか分からない
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [ordered, currentBoardId]);

  if (boards.length <= 1 && !currentBoardId) return null;

  const currentTitle = boards.find((b) => b.id === currentBoardId)?.title;

  return (
    <nav
      className="mz-border mz-scroll-x flex gap-2 border-b border-dotted px-3 py-2.5 lg:hidden"
      aria-label="板を移る"
    >
      {/* いま居る板をお気に入りに入れる／外す。列の先頭に置く */}
      {currentBoardId && (
        <FavoriteToggle
          boardId={currentBoardId}
          boardTitle={currentTitle}
          userId={userId}
          variant="chip"
        />
      )}

      {ordered.map((board) => {
        const active = board.id === currentBoardId;
        return (
          <Link
            key={board.id}
            href={`/b/${board.id}`}
            ref={active ? activeRef : undefined}
            aria-current={active ? 'page' : undefined}
            className="mz-chip mz-display shrink-0 px-3.5 py-2 text-[12px]"
            style={
              active
                ? {
                    background: 'var(--mz-ink)',
                    color: 'var(--mz-paper)',
                    boxShadow: 'var(--mz-pop-sm)',
                  }
                : { borderColor: 'var(--mz-line-soft)', color: 'var(--mz-ink-sub)' }
            }
          >
            {/* お気に入りの板には印を付ける。並びの理由が分かるようにするため */}
            {isFavorite(board.id) && !active && <span aria-hidden>★ </span>}
            {board.title}
          </Link>
        );
      })}

      <Link
        href="/"
        className="mz-chip shrink-0 px-3.5 py-2 text-[12px]"
        style={{ borderColor: 'var(--mz-line-soft)', color: 'var(--mz-ink-sub)' }}
      >
        板一覧 →
      </Link>
    </nav>
  );
}
