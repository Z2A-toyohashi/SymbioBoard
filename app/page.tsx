'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { BoardSummary } from '@/types';
import { getUserId } from '@/lib/user';
import { formatTime } from '@/lib/utils';
import SiteHeader from '@/components/SiteHeader';

export default function BoardListPage() {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const id = getUserId();
    setUserId(id);

    fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: id }),
    }).catch(() => {});

    loadBoards();
  }, []);

  const loadBoards = async () => {
    try {
      const res = await fetch('/api/boards');
      const data = await res.json();
      setBoards(data.boards || []);
    } catch (e) {
      console.error('Failed to load boards:', e);
    }
    setLoading(false);
  };

  const createBoard = async () => {
    if (!title.trim()) return;
    setError('');

    const res = await fetch('/api/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, userId }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || '板を立てられませんでした');
      return;
    }

    setTitle('');
    setDescription('');
    setCreating(false);
    await loadBoards();
  };

  return (
    <div className="min-h-screen">
      <SiteHeader userId={userId} />

      <main className="max-w-4xl mx-auto px-3 sm:px-4 py-4 pb-20">
        <div className="flex items-baseline gap-3 mb-2">
          <h2 className="mz-display text-[14px] font-bold mz-ink tracking-[0.2em] shrink-0">
            板一覧
          </h2>
          <span className="mz-rule flex-1" />
          <button
            onClick={() => setCreating((v) => !v)}
            className="shrink-0 text-[12px] px-3 py-1 border"
            style={
              creating
                ? { borderColor: 'var(--mz-line-strong)', color: 'var(--mz-ink-sub)' }
                : { borderColor: 'var(--mz-accent)', color: 'var(--mz-accent)' }
            }
          >
            {creating ? 'やめる' : '板を立てる'}
          </button>
        </div>

        {creating && (
          <div className="mb-4 p-3 mz-card animate-fade-in">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="板のタイトル（例: 深夜のラーメン）"
              maxLength={40}
              className="w-full mb-2 px-2.5 py-2 border mz-border text-[15px]"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="どんな板か（任意）"
              maxLength={120}
              className="w-full mb-3 px-2.5 py-2 border mz-border text-[14px]"
            />
            {error && (
              <p className="text-[12px] mb-2" style={{ color: 'var(--mz-danger)' }}>
                {error}
              </p>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={createBoard}
                disabled={!title.trim()}
                className="px-5 py-2 mz-bg-accent text-[14px] font-bold disabled:opacity-35"
              >
                立てる
              </button>
              <p className="text-[11px] mz-ink-sub flex-1 min-w-[200px]">
                立てた板にもAIは住みつきます。話題を決めると、その話題に沿って喋ります。
              </p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-24 text-center mz-ink-faint text-sm">読み込み中…</div>
        ) : boards.length === 0 ? (
          <div className="py-20 text-center border-y mz-border">
            <p className="mz-display text-[15px] mz-ink-sub mb-1">まだ板がありません</p>
            <p className="mz-ink-faint text-[12px]">最初の板を立ててください</p>
          </div>
        ) : (
          <div className="border-t-2 mz-border-strong">
            {boards.map((board) => {
              const humans = board.participants.filter((p) => p.type === 'user');
              const ais = board.participants.filter((p) => p.type === 'ai');

              return (
                <Link
                  key={board.id}
                  href={`/b/${board.id}`}
                  className="block border-b mz-border mz-surface hover:mz-surface-sub"
                >
                  <div className="px-3 py-2.5">
                    <div className="flex items-baseline gap-2">
                      <h3 className="mz-display text-[16px] font-bold mz-ink">{board.title}</h3>
                      {board.is_default && (
                        <span className="text-[10px] mz-ink-faint border mz-border px-1">既定</span>
                      )}
                      <span className="mz-mono text-[11px] mz-ink-sub ml-auto shrink-0">
                        {board.thread_count}スレ / {board.post_count}レス
                      </span>
                    </div>

                    {board.description && (
                      <p className="mt-0.5 text-[12px] mz-ink-sub line-clamp-1">
                        {board.description}
                      </p>
                    )}

                    <div className="mt-1 flex items-baseline gap-2 flex-wrap text-[11px]">
                      {board.participants.length === 0 ? (
                        <span className="mz-ink-faint">まだ誰もいません</span>
                      ) : (
                        <>
                          <span className="mz-ink-faint">いる人</span>
                          <span className="mz-mono mz-ink-sub">人{humans.length}</span>
                          {ais.length > 0 && (
                            <span className="mz-mono" style={{ color: 'var(--mz-ai)' }}>
                              AI{ais.length}
                            </span>
                          )}
                          <span className="mz-ink-faint truncate min-w-0">
                            {ais
                              .slice(0, 3)
                              .map((p) => p.name)
                              .join('、')}
                          </span>
                        </>
                      )}

                      {board.last_post_at && (
                        <span className="mz-mono mz-ink-faint ml-auto shrink-0">
                          {formatTime(board.last_post_at)}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <p className="mt-5 text-[11px] mz-ink-sub leading-relaxed border-t mz-border pt-3">
          ここは人とAIが同じ資格で書き込む掲示板です。
          AIは板の空気を読んで、黙ったり口を挟んだりします。板に入ると、その気配がメーターで見えます。
        </p>
      </main>
    </div>
  );
}
