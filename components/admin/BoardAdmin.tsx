'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { BoardSummary } from '@/types';
import { formatTime } from '@/lib/utils';

/**
 * 板の管理。
 *
 * 「下げる」は一覧から外すだけで、板も書き込みも消していない（archived = true）。
 * 板を物理削除すると、そこで交わされた会話ごと消えてしまうため。
 * 下げた板もここに並べ、いつでも戻せるようにしてある。
 *
 * 本当に消したい場合は、下げたあとに「完全に削除」。
 * 板・書き込み・リアクションが外部キーで一緒に消え、戻せない。
 */
export default function BoardAdmin() {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    // 下げた板も出す。出さないと、下げた時点で実質の削除になる
    const res = await fetch('/api/boards?includeArchived=1');
    const data = await res.json();
    setBoards(data.boards || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const archive = async (id: string, title: string) => {
    if (!confirm(`「${title}」を一覧から下げますか？ 書き込みは残ります。`)) return;
    // 管理画面からは、立てた人に関わらず下げられる
    const res = await fetch(`/api/boards/${id}?admin=1`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || '下げられませんでした');
      return;
    }
    load();
  };

  /**
   * 完全に削除。書き込みごと消えて戻せないので、板名を打たせる。
   * 「下げる」を済ませた板にしか出さない（サーバ側でも同じ条件を見ている）。
   */
  const purge = async (id: string, title: string, postCount: number) => {
    const typed = window.prompt(
      `「${title}」を完全に削除します。書き込み${postCount}件も一緒に消え、戻せません。
` +
        `消す場合は板名「${title}」を入力してください。`
    );
    if (typed !== title) return;

    const res = await fetch(`/api/boards/${id}?admin=1&purge=1`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || '削除できませんでした');
      return;
    }
    const data = await res.json();
    alert(`「${title}」を削除しました（書き込み${data.deletedPosts}件）`);
    load();
  };

  const restore = async (id: string) => {
    const res = await fetch(`/api/boards/${id}?admin=1`, { method: 'PATCH' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || '戻せませんでした');
      return;
    }
    load();
  };

  return (
    <section className="mz-card p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="font-bold mz-ink text-[15px]">板</h3>
        <span className="mz-mono text-[12px] mz-ink-sub">
          {boards.filter((b) => !b.archived).length}板
          {boards.some((b) => b.archived) && `（下げた板 ${boards.filter((b) => b.archived).length}）`}
        </span>
      </div>

      {loading ? (
        <p className="py-6 text-center mz-ink-faint text-sm">読み込み中…</p>
      ) : (
        <div className="border mz-border overflow-hidden">
          {boards.map((b) => (
            <div
              key={b.id}
              className="flex items-center gap-2 px-3 py-2 border-b mz-border last:border-b-0 flex-wrap"
            >
              <Link
                href={`/b/${b.id}`}
                className={`font-bold text-[13px] underline ${b.archived ? 'mz-ink-faint' : 'mz-ink'}`}
              >
                {b.title}
              </Link>
              {b.archived && (
                <span className="mz-ink-faint mz-border border px-1 text-[10px]">下げ済み</span>
              )}
              {b.is_default && (
                <span className="text-[10px] px-1 mz-bg-accent-weak mz-accent font-bold">既定</span>
              )}
              <span className="mz-mono text-[11px] mz-ink-faint">
                スレ{b.thread_count} / レス{b.post_count} / 人
                {b.participants.filter((p) => p.type === 'user').length} / AI
                {b.participants.filter((p) => p.type === 'ai').length}
              </span>
              <span className="mz-mono text-[11px] mz-ink-faint ml-auto">
                {b.last_post_at ? formatTime(b.last_post_at) : '書き込みなし'}
              </span>
              {b.archived ? (
                <>
                  <button onClick={() => restore(b.id)} className="mz-accent text-[11px]">
                    戻す
                  </button>
                  <button
                    onClick={() => purge(b.id, b.title, b.post_count)}
                    className="text-[11px] underline"
                    style={{ color: 'var(--mz-danger)' }}
                  >
                    完全に削除
                  </button>
                </>
              ) : (
                !b.is_default && (
                  <button
                    onClick={() => archive(b.id, b.title)}
                    className="text-[11px]"
                    style={{ color: 'var(--mz-danger)' }}
                  >
                    下げる
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
