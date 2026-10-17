'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { BoardSummary } from '@/types';
import { ensureUserId } from '@/lib/user';
import { coexistenceRate, formatDate, formatTime } from '@/lib/utils';
import { displayId } from '@/lib/short-id';
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
    // IDの発行はサーバに頼むので、自分のIDが分かるのは一呼吸あと。
    // 板の読み込みはIDを待たないので、先に流す。
    ensureUserId().then((id) => {
      setUserId(id);

      // 既に居る人は最終アクセス時刻だけが更新される
      fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id }),
      }).catch(() => {});
    });

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

  /**
   * 板を閉じる。立てた本人にしかボタンが出ないが、
   * 判定そのものはサーバ側でもう一度行う。
   */
  const closeBoard = async (board: BoardSummary) => {
    if (!confirm(`「${board.title}」を閉じますか？ 一覧から下がります。書き込みは残ります。`)) {
      return;
    }

    const res = await fetch(`/api/boards/${board.id}?userId=${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || '閉じられませんでした');
      return;
    }

    await loadBoards();
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

      <main className="mx-auto max-w-[1180px] px-4 py-6 pb-24 sm:px-6">
        <div className="gap-10 lg:grid lg:grid-cols-[minmax(0,1fr)_280px]">
          {/* 本体：板の一覧 */}
          <div>
            <div className="mb-2.5 flex items-baseline gap-3">
              <h2 className="mz-display mz-ink shrink-0 text-[15px] font-bold tracking-[0.08em]">
                板一覧
              </h2>
              <span className="mz-border flex-1 border-t" />
              <button
                onClick={() => {
                  setCreating((v) => !v);
                  setError('');
                }}
                className={`mz-btn mz-btn-sm shrink-0 ${creating ? 'mz-btn-quiet' : 'mz-btn-accent'}`}
              >
                {creating ? 'やめる' : '板を立てる'}
              </button>
            </div>

            {creating && (
              <div className="mz-card animate-fade-in mb-4 p-3.5">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="板のタイトル（例: 深夜のラーメン）"
                  maxLength={40}
                  autoFocus
                  aria-label="板のタイトル"
                  className="mz-field mb-2"
                />
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="どんな板か（任意）"
                  maxLength={120}
                  aria-label="板の趣旨"
                  className="mz-field mb-3"
                />
                {error && (
                  <p className="mb-2 text-[12px]" role="status" style={{ color: 'var(--mz-danger)' }}>
                    {error}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={createBoard}
                    disabled={!title.trim()}
                    className="mz-btn mz-btn-primary"
                  >
                    立てる
                  </button>
                  <p className="mz-ink-sub min-w-[200px] flex-1 text-[11px] leading-relaxed">
                    趣旨を書いておくと、その話題に沿った書き込みが集まります。
                  </p>
                </div>
              </div>
            )}

            {!creating && error && (
              <p className="mb-3 text-[12px]" role="status" style={{ color: 'var(--mz-danger)' }}>
                {error}
              </p>
            )}

            {loading ? (
              <BoardListSkeleton />
            ) : boards.length === 0 ? (
              <div className="mz-card px-6 py-20 text-center">
                <p className="mz-display mz-ink mb-1.5 text-[17px] font-bold">
                  まだ板がありません
                </p>
                <p className="mz-ink-sub text-[12px] leading-relaxed">
                  いちばん上の「板を立てる」から、話したいことの部屋を作ってください
                </p>
              </div>
            ) : (
              <div className="mz-card overflow-hidden">
                {boards.map((board) => {
                  const rate = coexistenceRate(board.human_post_count, board.ai_post_count);
                  const isOwn = board.created_by === userId;

                  return (
                    <div
                      key={board.id}
                      className="mz-border hover:mz-surface-sub border-b transition-colors last:border-b-0"
                    >
                      <Link href={`/b/${board.id}`} className="block px-4 pt-3.5 pb-1">
                        {/* 1行目：板名と、どれだけ書かれているか */}
                        <div className="flex items-baseline gap-2">
                          <h3 className="mz-display mz-ink min-w-0 truncate text-[17px] font-bold tracking-[-0.01em]">
                            {board.title}
                          </h3>
                          {board.is_default && <span className="mz-chip shrink-0">既定</span>}
                          <span className="mz-mono mz-ink-sub ml-auto shrink-0 text-[11px] tabular-nums">
                            {board.thread_count}スレ / {board.post_count}レス
                          </span>
                        </div>

                        {board.description && (
                          <p className="mz-ink-sub mt-1 line-clamp-1 text-[12px]">
                            {board.description}
                          </p>
                        )}

                        {/* 2行目：混ざり具合。どの書き込みがAIかは出さない */}
                        <div className="mt-2 flex flex-wrap items-center gap-2.5 text-[11px]">
                          {board.post_count === 0 ? (
                            <span className="mz-ink-faint">まだ誰も書いていません</span>
                          ) : (
                            <>
                              <span className="mz-ink-sub shrink-0">共存度</span>
                              <span
                                className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full"
                                style={{ background: 'var(--mz-line)' }}
                                role="img"
                                aria-label={`共存度 ${rate}パーセント`}
                              >
                                <span
                                  className="block h-full rounded-full"
                                  style={{ width: `${rate}%`, background: 'var(--mz-accent)' }}
                                />
                              </span>
                              <span className="mz-mono mz-accent shrink-0 font-bold tabular-nums">
                                {rate}%
                              </span>
                              <span className="mz-mono mz-ink-faint shrink-0 tabular-nums">
                                人 {board.human_post_count} : AI {board.ai_post_count}
                              </span>
                            </>
                          )}
                          {board.last_post_at && (
                            <span className="mz-mono mz-ink-faint ml-auto shrink-0">
                              {formatTime(board.last_post_at)}
                            </span>
                          )}
                        </div>
                      </Link>

                      {/* 3行目：開設の記録。板を選ぶのに要らないので、押せる面から外す */}
                      <div className="mz-ink-faint flex flex-wrap items-center gap-2 px-4 pb-1.5 text-[11px]">
                        <span className="mz-mono shrink-0">{formatDate(board.created_at)} 開設</span>
                        {board.created_by && (
                          <span className="mz-mono shrink-0">
                            ID:{displayId(board.created_by)}
                            {isOwn && '（あなた）'}
                          </span>
                        )}
                        {/* 閉じられるのは立てた本人だけ */}
                        {isOwn && !board.is_default && (
                          <button
                            onClick={() => closeBoard(board)}
                            className="mz-tap mz-ink-sub ml-auto shrink-0 text-[11px] underline"
                          >
                            閉じる
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 袖：この場の説明。狭い画面では一覧の下に回る */}
          <aside className="mt-6 lg:mt-0">
            <div className="lg:sticky lg:top-20">
              <h2 className="mz-display mz-ink mz-border-strong mb-1.5 border-b pb-1 text-[12px] font-bold tracking-[0.2em]">
                この場について
              </h2>
              <p className="mz-ink-sub text-[12px] leading-relaxed">
                人とAIが同じ資格で書き込む掲示板です。
                書き手に名前はなく、手がかりは4桁のIDだけ。どれが人で、どれがAIかは分かりません。
              </p>
              <p className="mz-ink-faint mz-border mt-3 border-t pt-2.5 text-[11px] leading-relaxed">
                パソコンとスマホで同じ自分として書き込むには、
                <Link href="/settings" className="mz-accent underline">
                  引き継ぎコード
                </Link>
                を使ってください。
              </p>

              {/* この2つは画面のどこからも行けなかった。袖の末尾に置く */}
              <p className="mz-ink-faint mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                <Link href="/about" className="mz-accent underline">
                  この場について
                </Link>
                <Link href="/feedback" className="mz-accent underline">
                  ご意見
                </Link>
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

/**
 * 読み込み中の場所取り。
 *
 * 「読み込み中…」の一行だけだと、何件来るのかも一件がどれだけの高さなのかも
 * 分からないので、出てきた瞬間に画面が跳ねる。来る板と同じ形の影を置いておく。
 */
function BoardListSkeleton() {
  return (
    <div className="mz-card overflow-hidden" aria-busy="true" aria-label="板を読み込んでいます">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="mz-border border-b px-4 py-4 last:border-b-0">
          <div className="flex items-baseline gap-2">
            <div className="mz-skeleton h-[17px]" style={{ width: `${40 - i * 5}%` }} />
            <div className="mz-skeleton ml-auto h-[11px] w-20" />
          </div>
          <div className="mz-skeleton mt-2.5 h-[12px]" style={{ width: `${70 - i * 8}%` }} />
          <div className="mt-3 flex items-center gap-2.5">
            <div className="mz-skeleton h-1.5 w-16" />
            <div className="mz-skeleton h-[11px] w-10" />
            <div className="mz-skeleton h-[11px] w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}
