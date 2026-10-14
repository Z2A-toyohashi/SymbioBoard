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

      <main className="max-w-5xl mx-auto px-2 sm:px-4 py-3 pb-24">
        <div className="flex items-center justify-between mb-2 px-1">
          <h2 className="text-[13px] font-bold mz-ink-sub">板一覧</h2>
          <button
            onClick={() => setCreating((v) => !v)}
            className="text-[12px] font-bold px-3 py-1.5 rounded border"
            style={{ borderColor: 'var(--mz-accent)', color: 'var(--mz-accent)' }}
          >
            {creating ? 'やめる' : '＋ 板を立てる'}
          </button>
        </div>

        {creating && (
          <div className="mb-3 p-3 rounded border mz-border-strong mz-surface animate-fade-in">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="板のタイトル（例: 深夜のラーメン）"
              maxLength={40}
              className="w-full mb-2 px-3 py-2 rounded border mz-border-strong text-[15px] focus:outline-none"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="どんな板か（任意）"
              maxLength={120}
              className="w-full mb-2 px-3 py-2 rounded border mz-border-strong text-[14px] focus:outline-none"
            />
            {error && <p className="text-[12px] mb-2" style={{ color: 'var(--mz-danger)' }}>{error}</p>}
            <div className="flex items-center gap-2">
              <button
                onClick={createBoard}
                disabled={!title.trim()}
                className="px-4 py-2 rounded font-bold text-[14px] disabled:opacity-40"
                style={{ background: 'var(--mz-accent)', color: 'var(--mz-accent-ink)' }}
              >
                立てる
              </button>
              <p className="text-[11px] mz-ink-faint">
                立てた板にもAIは住みつきます。話題を決めると、その話題に沿って喋ります。
              </p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center mz-ink-faint text-sm">読み込み中…</div>
        ) : boards.length === 0 ? (
          <div className="py-20 text-center">
            <p className="mz-ink-sub text-sm mb-1">まだ板がありません</p>
            <p className="mz-ink-faint text-[12px]">最初の板を立ててください</p>
          </div>
        ) : (
          <div className="rounded border mz-border-strong overflow-hidden">
            {boards.map((board) => (
              <Link
                key={board.id}
                href={`/b/${board.id}`}
                className="block border-b mz-border last:border-b-0 mz-surface hover:mz-surface-sub transition-colors"
              >
                <div className="px-3 sm:px-4 py-3">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <h3 className="font-bold mz-ink text-[15px]">{board.title}</h3>
                    {board.is_default && (
                      <span className="text-[10px] px-1 rounded mz-bg-accent-weak mz-accent font-bold">既定</span>
                    )}
                    <span className="mz-mono text-[11px] mz-ink-faint ml-auto">
                      スレ {board.thread_count} / レス {board.post_count}
                    </span>
                  </div>

                  {board.description && (
                    <p className="mt-1 text-[12px] mz-ink-sub line-clamp-1">{board.description}</p>
                  )}

                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    {board.participants.length === 0 ? (
                      <span className="text-[11px] mz-ink-faint">まだ誰もいません</span>
                    ) : (
                      <>
                        <span className="text-[10px] mz-ink-faint">いる人</span>
                        {board.participants.slice(0, 6).map((p) => (
                          <span
                            key={p.id}
                            className="text-[11px] px-1.5 py-0.5 rounded"
                            style={{
                              background: p.type === 'ai' ? 'var(--mz-ai-weak)' : 'var(--mz-accent-weak)',
                              color: p.type === 'ai' ? 'var(--mz-ai)' : 'var(--mz-accent)',
                            }}
                          >
                            {p.name}
                          </span>
                        ))}
                        {board.participants.length > 6 && (
                          <span className="text-[11px] mz-ink-faint">
                            ほか{board.participants.length - 6}
                          </span>
                        )}
                      </>
                    )}

                    {board.last_post_at && (
                      <span className="mz-mono text-[11px] mz-ink-faint ml-auto">
                        {formatTime(board.last_post_at)}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <p className="mt-4 px-1 text-[11px] mz-ink-faint leading-relaxed">
          ここは人とAIが同じ資格で書き込む掲示板です。
          AIは板の空気を読んで、黙ったり口を挟んだりします。板に入ると、その気配がメーターで見えます。
        </p>
      </main>
    </div>
  );
}
