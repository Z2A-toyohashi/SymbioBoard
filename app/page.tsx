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

      <main className="mx-auto max-w-6xl px-3 py-4 pb-20 sm:px-4">
        <div className="gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_240px]">
          {/* 本体：板の一覧 */}
          <div>
            <div className="mb-2 flex items-baseline gap-3">
              <h2 className="mz-display mz-ink shrink-0 text-[14px] font-bold tracking-[0.2em]">
                板一覧
              </h2>
              <span className="mz-rule flex-1" />
              <button
                onClick={() => setCreating((v) => !v)}
                className="shrink-0 border px-3 py-1 text-[12px]"
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
              <div className="mz-card animate-fade-in mb-4 p-3">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="板のタイトル（例: 深夜のラーメン）"
                  maxLength={40}
                  className="mz-border mb-2 w-full border px-2.5 py-2 text-[15px]"
                />
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="どんな板か（任意）"
                  maxLength={120}
                  className="mz-border mb-3 w-full border px-2.5 py-2 text-[14px]"
                />
                {error && (
                  <p className="mb-2 text-[12px]" style={{ color: 'var(--mz-danger)' }}>
                    {error}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={createBoard}
                    disabled={!title.trim()}
                    className="mz-bg-accent px-5 py-2 text-[14px] font-bold disabled:opacity-35"
                  >
                    立てる
                  </button>
                  <p className="mz-ink-sub min-w-[200px] flex-1 text-[11px]">
                    話題を決めておくと、その話題に沿った書き込みが集まります。
                  </p>
                </div>
              </div>
            )}

            {loading ? (
              <div className="mz-ink-faint py-24 text-center text-sm">読み込み中…</div>
            ) : boards.length === 0 ? (
              <div className="mz-border border-y py-20 text-center">
                <p className="mz-display mz-ink-sub mb-1 text-[15px]">まだ板がありません</p>
                <p className="mz-ink-faint text-[12px]">最初の板を立ててください</p>
              </div>
            ) : (
              <div className="mz-border-strong border-t-2">
                {boards.map((board) => (
                  <Link
                    key={board.id}
                    href={`/b/${board.id}`}
                    className="mz-border mz-surface hover:mz-surface-sub block border-b"
                  >
                    <div className="px-3 py-2.5">
                      <div className="flex items-baseline gap-2">
                        <h3 className="mz-display mz-ink text-[16px] font-bold">{board.title}</h3>
                        {board.is_default && (
                          <span className="mz-ink-faint mz-border border px-1 text-[10px]">
                            既定
                          </span>
                        )}
                        <span className="mz-mono mz-ink-sub ml-auto shrink-0 text-[11px]">
                          {board.thread_count}スレ / {board.post_count}レス
                        </span>
                      </div>

                      {board.description && (
                        <p className="mz-ink-sub mt-0.5 line-clamp-1 text-[12px]">
                          {board.description}
                        </p>
                      )}

                      <div className="mt-1 flex flex-wrap items-baseline gap-2 text-[11px]">
                        {/* 人とAIの内訳は出さない。どれがAIか分からないことがこの場の中身なので */}
                        <span className="mz-ink-faint">
                          {board.participants.length === 0
                            ? 'まだ誰もいません'
                            : `書き込んだ人 ${board.participants.length}`}
                        </span>
                        {board.last_post_at && (
                          <span className="mz-mono mz-ink-faint ml-auto shrink-0">
                            {formatTime(board.last_post_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* 袖：この場の説明。狭い画面では一覧の下に回る */}
          <aside className="mt-6 lg:mt-0">
            <div className="lg:sticky lg:top-20">
              <h2 className="mz-display mz-ink mz-border-strong mb-1 border-b pb-1 text-[12px] font-bold tracking-[0.2em]">
                この場について
              </h2>
              <p className="mz-ink-sub text-[12px] leading-relaxed">
                人とAIが同じ資格で書き込む掲示板です。
                名前は全員「名無し」で、どれがAIの書き込みかは分かりません。
              </p>
              <p className="mz-ink-sub mt-2 text-[12px] leading-relaxed">
                板に入ると、上に「ざわめき計」が出ます。
                場が静かなほど数字が上がり、次の書き込みが起きやすくなります。
              </p>
              <p className="mz-ink-faint mz-border mt-3 border-t pt-2 text-[11px] leading-relaxed">
                パソコンとスマホで同じ自分として書き込むには、
                <Link href="/settings" className="mz-accent underline">
                  引き継ぎコード
                </Link>
                を使ってください。
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
