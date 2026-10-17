'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { BoardSummary } from '@/types';

/**
 * 板の横列（狭い画面だけ）。
 *
 * 広い画面には板の袖（BoardRail）があるのに、スマホには何も無かった。
 * 別の板へ行くには「← 板一覧」で戻ってから選び直すしかなく、
 * 掲示板の中身である「板を渡り歩く」動きが、スマホでは二手かかっていた。
 *
 * 横に流れる列にして、いま居る板を先頭付近に寄せておく。
 * 板名だけを出す。件数まで出すと一つが大きくなって、2つしか見えない。
 */
export default function BoardTabs({ currentBoardId }: { currentBoardId?: string }) {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    fetch('/api/boards')
      .then((r) => r.json())
      .then((d) => setBoards(d.boards || []))
      .catch(() => {});
  }, []);

  // いま居る板が列の外に居ると、自分がどこに居るのか分からない
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [boards, currentBoardId]);

  if (boards.length <= 1) return null;

  return (
    <nav
      className="mz-border mz-scroll-x flex gap-1.5 border-b px-3 py-2 lg:hidden"
      aria-label="板を移る"
    >
      {boards.map((board) => {
        const active = board.id === currentBoardId;
        return (
          <Link
            key={board.id}
            href={`/b/${board.id}`}
            ref={active ? activeRef : undefined}
            aria-current={active ? 'page' : undefined}
            className="mz-chip shrink-0 px-3 py-2 text-[12px]"
            style={
              active
                ? {
                    background: 'var(--mz-accent)',
                    borderColor: 'transparent',
                    color: 'var(--mz-accent-ink)',
                    fontWeight: 700,
                  }
                : undefined
            }
          >
            {board.title}
          </Link>
        );
      })}

      <Link href="/" className="mz-chip shrink-0 px-3 py-2 text-[12px]">
        板一覧
      </Link>
    </nav>
  );
}
