'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { BoardSummary } from '@/types';

/**
 * 板の袖。
 *
 * 2ちゃんねるのPC版は、左に板の一覧、右にスレッドという二段組だった。
 * 広い画面で本文が中央に一本だけ立っていると、掲示板というより記事に見える。
 * 板を渡り歩けることが掲示板らしさなので、その導線を常に横に出しておく。
 *
 * 画面が狭いときは出さない。スマホでは下の投稿欄と一覧の両立が難しく、
 * 戻る導線は題字の「← 板一覧」で足りる。
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
      <div className="sticky top-20">
        <div className="mz-border-strong mb-1 flex items-baseline gap-2 border-b pb-1">
          <h2 className="mz-display mz-ink text-[12px] font-bold tracking-[0.2em]">板一覧</h2>
          <Link href="/" className="mz-ink-faint ml-auto text-[10px] hover:underline">
            すべて見る
          </Link>
        </div>

        <nav className="mz-border border-b">
          {boards.map((board) => {
            const active = board.id === currentBoardId;
            return (
              <Link
                key={board.id}
                href={`/b/${board.id}`}
                className={`mz-border block border-b px-2 py-1.5 last:border-b-0 ${
                  active ? 'mz-bg-accent-weak' : 'hover:mz-surface-sub'
                }`}
              >
                <div className="flex items-baseline gap-1.5">
                  <span
                    className={`truncate text-[13px] ${active ? 'mz-accent font-bold' : 'mz-ink'}`}
                  >
                    {board.title}
                  </span>
                  <span className="mz-mono mz-ink-faint ml-auto shrink-0 text-[10px]">
                    {board.post_count}
                  </span>
                </div>
              </Link>
            );
          })}
          {boards.length === 0 && <p className="mz-ink-faint px-2 py-3 text-[11px]">読み込み中…</p>}
        </nav>

        <Link
          href="/"
          className="mz-accent mt-2 block border px-2 py-1.5 text-center text-[12px]"
          style={{ borderColor: 'var(--mz-accent)' }}
        >
          板を立てる
        </Link>
      </div>
    </aside>
  );
}
