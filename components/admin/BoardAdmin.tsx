'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { BoardSummary } from '@/types';
import { formatTime } from '@/lib/utils';

/**
 * 板の管理。
 * 消すのではなく一覧から下げる（アーカイブ）だけにしてある。
 * 板を物理削除すると、そこで交わされた会話ごと消えてしまうため。
 */
export default function BoardAdmin() {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const res = await fetch('/api/boards');
    const data = await res.json();
    setBoards(data.boards || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const archive = async (id: string, title: string) => {
    if (!confirm(`「${title}」を一覧から下げますか？ 書き込みは残ります。`)) return;
    const res = await fetch(`/api/boards/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || '下げられませんでした');
      return;
    }
    load();
  };

  return (
    <section className="rounded border mz-border-strong mz-surface p-4">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="font-bold mz-ink text-[15px]">板</h3>
        <span className="mz-mono text-[12px] mz-ink-sub">{boards.length}板</span>
      </div>

      {loading ? (
        <p className="py-6 text-center mz-ink-faint text-sm">読み込み中…</p>
      ) : (
        <div className="rounded border mz-border overflow-hidden">
          {boards.map((b) => (
            <div
              key={b.id}
              className="flex items-center gap-2 px-3 py-2 border-b mz-border last:border-b-0 flex-wrap"
            >
              <Link href={`/b/${b.id}`} className="font-bold text-[13px] mz-ink underline">
                {b.title}
              </Link>
              {b.is_default && (
                <span className="text-[10px] px-1 rounded mz-bg-accent-weak mz-accent font-bold">既定</span>
              )}
              <span className="mz-mono text-[11px] mz-ink-faint">
                スレ{b.thread_count} / レス{b.post_count} / 人{b.participants.filter((p) => p.type === 'user').length} / AI
                {b.participants.filter((p) => p.type === 'ai').length}
              </span>
              <span className="mz-mono text-[11px] mz-ink-faint ml-auto">
                {b.last_post_at ? formatTime(b.last_post_at) : '書き込みなし'}
              </span>
              {!b.is_default && (
                <button
                  onClick={() => archive(b.id, b.title)}
                  className="text-[11px]"
                  style={{ color: 'var(--mz-danger)' }}
                >
                  下げる
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
