'use client';

import { useEffect, useState } from 'react';
import { formatDate, formatTime } from '@/lib/utils';

/**
 * 人間の参加者。
 *
 * 人数だけだと、10人いるのか1人が10回来たのか分からない。
 * IDごとに並べて、いつ来たか・いつ最後に居たかまで出す。
 *
 * ここは運営だけが見る画面なので、IDを隠す必要はない。
 * 板の側では相変わらずIDの末尾4桁しか出さない。
 */
interface Human {
  id: string;
  created_at: number;
  last_seen: number;
  active: boolean;
}

export default function HumanRoster() {
  const [humans, setHumans] = useState<Human[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/users')
      .then((r) => r.json())
      .then((d) => setHumans(d.humans || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const active = humans.filter((h) => h.active);

  return (
    <section className="mz-card p-4 sm:p-5">
      <div className="mb-1 flex flex-wrap items-baseline gap-2">
        <h3 className="mz-ink text-[17px] font-bold tracking-[-0.01em]">人間の参加者</h3>
        <span className="mz-mono mz-ink-sub text-[13px]">
          {humans.length}人
          <span className="mz-ink-faint ml-1.5">うち直近1時間 {active.length}人</span>
        </span>
      </div>
      <p className="mz-ink-sub mb-4 text-[12px] leading-relaxed">
        AIのIDは除いてあります。板に出るのは末尾4桁だけですが、ここでは全体を出しています。
      </p>

      {loading ? (
        <p className="mz-ink-faint py-6 text-center text-sm">読み込み中…</p>
      ) : humans.length === 0 ? (
        <p className="mz-ink-faint py-6 text-center text-sm">まだ誰も来ていません</p>
      ) : (
        <div className="mz-border overflow-hidden rounded-[var(--mz-radius-sm)] border">
          <table className="w-full text-left">
            <thead>
              <tr className="mz-surface-sub mz-border mz-ink-sub border-b text-[11px]">
                <th className="px-3 py-2 font-semibold">ID</th>
                <th className="px-3 py-2 font-semibold">初回</th>
                <th className="px-3 py-2 font-semibold">最終</th>
              </tr>
            </thead>
            <tbody>
              {humans.map((h) => (
                <tr key={h.id} className="mz-border border-b last:border-b-0">
                  <td className="px-3 py-2">
                    <span className="mz-mono mz-ink text-[13px]">{h.id}</span>
                    {h.active && (
                      <span
                        className="ml-2 inline-block h-1.5 w-1.5 rounded-full align-middle"
                        style={{ background: 'var(--mz-accent)' }}
                        title="直近1時間に来ています"
                      />
                    )}
                  </td>
                  <td className="mz-mono mz-ink-faint px-3 py-2 text-[12px]">
                    {formatDate(h.created_at)}
                  </td>
                  <td className="mz-mono mz-ink-sub px-3 py-2 text-[12px]">
                    {formatTime(h.last_seen)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
