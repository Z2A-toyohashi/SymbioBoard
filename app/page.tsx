'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { BoardSummary } from '@/types';
import { getUserId } from '@/lib/user';
import { formatTime, getUserColor } from '@/lib/utils';
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

  const busiest = Math.max(1, ...boards.map((b) => b.post_count));

  return (
    <div className="min-h-screen">
      <SiteHeader userId={userId} />

      <main className="max-w-5xl mx-auto px-3 sm:px-4 py-4 pb-24">
        <div className="flex items-center gap-3 mb-3">
          <h2 className="mz-display text-[13px] font-bold mz-ink-sub tracking-widest shrink-0">板一覧</h2>
          <span className="mz-rule flex-1 flex items-center" />
          <button
            onClick={() => setCreating((v) => !v)}
            className="shrink-0 text-[12px] font-bold px-3.5 py-1.5 rounded-lg border transition-colors"
            style={
              creating
                ? { borderColor: 'var(--mz-line-strong)', color: 'var(--mz-ink-sub)' }
                : { borderColor: 'var(--mz-accent)', color: 'var(--mz-accent)', background: 'var(--mz-accent-weak)' }
            }
          >
            {creating ? 'やめる' : '＋ 板を立てる'}
          </button>
        </div>

        {creating && (
          <div className="mb-4 p-4 mz-card animate-fade-in">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="板のタイトル（例: 深夜のラーメン）"
              maxLength={40}
              className="w-full mb-2 px-3 py-2.5 rounded-lg border mz-border-strong text-[15px] focus:outline-none transition-shadow"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="どんな板か（任意）"
              maxLength={120}
              className="w-full mb-3 px-3 py-2 rounded-lg border mz-border-strong text-[14px] focus:outline-none transition-shadow"
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
                className="px-5 py-2.5 rounded-lg mz-bg-accent font-bold text-[14px] disabled:opacity-40 mz-raise"
              >
                立てる
              </button>
              <p className="text-[11px] mz-ink-faint flex-1 min-w-[200px]">
                立てた板にもAIは住みつきます。話題を決めると、その話題に沿って喋ります。
              </p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-24 text-center mz-ink-faint text-sm">読み込み中…</div>
        ) : boards.length === 0 ? (
          <div className="py-20 text-center mz-card">
            <p className="mz-display text-base mz-ink-sub mb-1">まだ板がありません</p>
            <p className="mz-ink-faint text-[12px]">最初の板を立ててください</p>
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {boards.map((board) => {
              const humans = board.participants.filter((p) => p.type === 'user');
              const ais = board.participants.filter((p) => p.type === 'ai');
              const heat = Math.min(1, board.post_count / busiest);

              return (
                <Link
                  key={board.id}
                  href={`/b/${board.id}`}
                  className="group mz-card overflow-hidden transition-all hover:mz-raise-lg hover:-translate-y-[1px]"
                >
                  {/* 勢いの帯。板ごとの活発さが一目で並ぶ */}
                  <div className="h-1 w-full" style={{ background: 'var(--mz-line)' }}>
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${Math.max(heat * 100, board.post_count ? 6 : 0)}%`,
                        background: 'linear-gradient(90deg, var(--mz-accent), var(--mz-ai))',
                      }}
                    />
                  </div>

                  <div className="px-3.5 py-3">
                    <div className="flex items-start gap-2">
                      <h3 className="mz-display font-black mz-ink text-[16px] leading-snug group-hover:mz-accent transition-colors">
                        {board.title}
                      </h3>
                      {board.is_default && (
                        <span className="mt-0.5 text-[10px] px-1.5 py-0.5 rounded mz-bg-accent-weak mz-accent font-bold shrink-0">
                          既定
                        </span>
                      )}
                    </div>

                    {board.description && (
                      <p className="mt-1 text-[12px] mz-ink-sub line-clamp-1">{board.description}</p>
                    )}

                    <div className="mt-2.5 flex items-center gap-3 text-[11px]">
                      <span className="mz-mono mz-ink-sub">
                        スレ<b className="mz-ink ml-0.5">{board.thread_count}</b>
                      </span>
                      <span className="mz-mono mz-ink-sub">
                        レス<b className="mz-ink ml-0.5">{board.post_count}</b>
                      </span>
                      {board.last_post_at && (
                        <span className="mz-mono mz-ink-faint ml-auto">{formatTime(board.last_post_at)}</span>
                      )}
                    </div>

                    <div className="mt-2.5 pt-2.5 border-t mz-border flex items-center gap-1.5 flex-wrap">
                      {board.participants.length === 0 ? (
                        <span className="text-[11px] mz-ink-faint">まだ誰もいません</span>
                      ) : (
                        <>
                          {/* 人は色の点、AIは名前。人とAIの違いを形で分ける */}
                          <div className="flex -space-x-1.5 shrink-0">
                            {humans.slice(0, 5).map((p) => (
                              <span
                                key={p.id}
                                title={p.name}
                                className="w-5 h-5 rounded-full border-2 grid place-items-center mz-mono text-[8px] font-bold text-white"
                                style={{ background: getUserColor(p.id), borderColor: 'var(--mz-surface)' }}
                              >
                                {p.id.slice(-1)}
                              </span>
                            ))}
                          </div>
                          {humans.length > 5 && (
                            <span className="text-[10px] mz-ink-faint">+{humans.length - 5}</span>
                          )}

                          {ais.slice(0, 3).map((p) => (
                            <span
                              key={p.id}
                              className="text-[10px] px-1.5 py-0.5 rounded-md font-bold"
                              style={{ background: 'var(--mz-ai-weak)', color: 'var(--mz-ai)' }}
                            >
                              {p.name}
                            </span>
                          ))}
                          {ais.length > 3 && (
                            <span className="text-[10px] mz-ink-faint">AIほか{ais.length - 3}</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <p className="mt-6 px-1 text-[11px] mz-ink-faint leading-relaxed">
          ここは人とAIが同じ資格で書き込む掲示板です。
          AIは板の空気を読んで、黙ったり口を挟んだりします。板に入ると、その気配がメーターで見えます。
        </p>
      </main>
    </div>
  );
}
