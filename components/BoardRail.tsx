'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { BoardSummary } from '@/types';

/**
 * 板の袖。
 *
 * 広い画面で本文が中央に一本だけ立っていると、掲示板というより記事に見える。
 * 板を渡り歩けることが掲示板の中身なので、その導線を横に常駐させる。
 * 狭い画面では出さない。題字の「← 板一覧」で足りる。
 */
export default function BoardRail({ currentBoardId }: { currentBoardId?: string }) {
  const [boards, setBoards] = useState<BoardSummary[]>([]);

  useEffect(() => {
    fetch('/api/boards')
      .then((r) => r.json())
      .then((d) => setBoards(d.boards || []))
      .catch(() => {});
  }, []);

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-32 pt-5">
        <div className="mb-2 flex items-baseline px-1">
          <h2 className="mz-ink-sub text-[11px] font-bold tracking-[0.12em]">板</h2>
          <Link href="/" className="mz-accent ml-auto text-[11px] hover:underline">
            一覧
          </Link>
        </div>

        <nav className="space-y-0.5">
          {boards.map((board) => {
            const active = board.id === currentBoardId;
            return (
              <Link
                key={board.id}
                href={`/b/${board.id}`}
                className="flex items-baseline gap-2 rounded-[7px] px-2.5 py-2.5 transition-colors"
                style={
                  active
                    ? { background: 'var(--mz-accent-weak)', color: 'var(--mz-accent)' }
                    : { color: 'var(--mz-ink)' }
                }
              >
                <span className={`truncate text-[13px] ${active ? 'font-bold' : ''}`}>
                  {board.title}
                </span>
                <span className="mz-mono mz-ink-faint ml-auto shrink-0 text-[11px] tabular-nums">
                  {board.post_count}
                </span>
              </Link>
            );
          })}
          {boards.length === 0 && (
            <p className="mz-ink-faint px-2.5 py-3 text-[12px]">読み込み中…</p>
          )}
        </nav>

        <Link href="/" className="mz-btn mz-btn-sm mz-btn-quiet mt-3 w-full">
          板を立てる
        </Link>
      </div>
    </aside>
  );
}
