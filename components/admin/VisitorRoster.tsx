'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDate, formatTime } from '@/lib/utils';
import { displayId } from '@/lib/short-id';

/**
 * 訪問者（人だけ）。
 *
 * もとは「場の設定」の画面の中に、IDと初回・最終だけの一覧として入っていた。
 * 設定を決める画面と、人を見る画面は頭の使い方が違うので、タブを分けた。
 *
 * 足したのは訪問回数。
 * 「10人が1回ずつ」と「1人が10回」は人数が同じでも意味が正反対で、
 * 戻ってきているかどうかがこの場の成否そのものなので、いちばん左に置く。
 *
 * 1回の訪問は「30分空いたら次の訪問」で数えている（app/api/visitors）。
 * ページを開いた回数ではない。板を5つ渡り歩いても1回。
 *
 * 行をクリックすると、その人の行動そのもの（行動タブ）に飛ぶ。
 * 数字を見て気になった人を、そのまま追えるようにしておく。
 *
 * ここは運営だけが見る画面なので、IDは全体を出す。
 * 板の側では相変わらず末尾4桁しか出さない。
 */

interface Visitor {
  id: string;
  created_at: number;
  last_seen: number;
  active: boolean;
  visits: number;
  lastVisitAt: number | null;
  firstEventAt: number | null;
  posts: number;
  boardViews: number;
  boards: number;
  dwellMs: number;
  reactions: number;
  guesses: number;
}

interface Totals {
  people: number;
  active: number;
  returning: number;
  visits: number;
}

/** 見る期間の選択肢 */
const RANGES = [
  { days: 7, label: '7日' },
  { days: 30, label: '30日' },
  { days: 90, label: '90日' },
  { days: 365, label: '1年' },
];

type SortKey = 'visits' | 'last' | 'posts' | 'dwell';

export default function VisitorRoster() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [totals, setTotals] = useState<Totals>({ people: 0, active: 0, returning: 0, visits: 0 });
  const [gap, setGap] = useState(30);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [sort, setSort] = useState<SortKey>('visits');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/visitors?days=${days}`, { cache: 'no-store' });
      const data = await res.json();
      setVisitors(data.visitors || []);
      setTotals(data.totals || { people: 0, active: 0, returning: 0, visits: 0 });
      setGap(data.visitGapMinutes || 30);
      setTruncated(Boolean(data.truncated));
    } catch (error) {
      console.error('Failed to load visitors:', error);
    }
    setLoading(false);
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = [...visitors].sort((a, b) => {
    switch (sort) {
      case 'last':
        return b.last_seen - a.last_seen;
      case 'posts':
        return b.posts - a.posts || b.visits - a.visits;
      case 'dwell':
        return b.dwellMs - a.dwellMs || b.visits - a.visits;
      default:
        return b.visits - a.visits || b.last_seen - a.last_seen;
    }
  });

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="のべ人数" value={totals.people} note={`AIを除く・${days}日`} />
        <Stat label="いる人" value={totals.active} note="直近1時間" />
        <Stat
          label="戻ってきた人"
          value={totals.returning}
          note={`2回以上来た人（${days}日）`}
        />
        <Stat label="訪問の合計" value={totals.visits} note={`${gap}分空いたら次の訪問`} />
      </section>

      <section className="mz-card p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="mz-ink mr-auto text-[17px] font-bold tracking-[-0.01em]">
            ひとりずつ
            <span className="mz-mono mz-ink-sub ml-2 text-[13px]">{sorted.length}人</span>
          </h3>

          {RANGES.map((range) => (
            <button
              key={range.days}
              onClick={() => setDays(range.days)}
              className={`px-3 py-1.5 text-[12px] ${
                days === range.days ? 'mz-bg-accent font-bold' : 'mz-ink-sub mz-border border'
              }`}
            >
              {range.label}
            </button>
          ))}

          <button onClick={load} className="mz-btn mz-btn-sm mz-btn-quiet">
            読み直す
          </button>
        </div>

        <p className="mz-ink-sub mb-4 text-[12px] leading-relaxed">
          1回の訪問は「{gap}分空いたら次の訪問」で数えています（ページを開いた回数ではありません）。
          <br />
          行動の記録を始める前に来ていた人は、訪問が0のまま「初回」だけが残ります。
          IDを押すと、その人の行動そのものが見られます。
          {truncated && (
            <>
              <br />
              <span style={{ color: 'var(--mz-danger)' }}>
                記録の読み取り上限に達しました。これより古い訪問は数えていません（期間を短くしてください）。
              </span>
            </>
          )}
        </p>

        {loading ? (
          <p className="mz-ink-faint py-6 text-center text-sm">読み込み中…</p>
        ) : sorted.length === 0 ? (
          <p className="mz-ink-faint py-6 text-center text-sm">まだ誰も来ていません</p>
        ) : (
          <div className="mz-border overflow-x-auto rounded-[var(--mz-radius-sm)] border">
            <table className="w-full text-left">
              <thead>
                <tr className="mz-surface-sub mz-border mz-ink-sub border-b text-[11px]">
                  <th className="px-3 py-2 font-semibold">ID</th>
                  <SortableHead
                    label="訪問"
                    active={sort === 'visits'}
                    onClick={() => setSort('visits')}
                  />
                  <SortableHead
                    label="書いた"
                    active={sort === 'posts'}
                    onClick={() => setSort('posts')}
                  />
                  <th className="px-3 py-2 font-semibold">板を開いた</th>
                  <th className="px-3 py-2 font-semibold">板の数</th>
                  <SortableHead
                    label="読んでいた時間"
                    active={sort === 'dwell'}
                    onClick={() => setSort('dwell')}
                  />
                  <th className="px-3 py-2 font-semibold">押した</th>
                  <th className="px-3 py-2 font-semibold">見立て</th>
                  <th className="px-3 py-2 font-semibold">初回</th>
                  <SortableHead
                    label="最終"
                    active={sort === 'last'}
                    onClick={() => setSort('last')}
                  />
                </tr>
              </thead>
              <tbody>
                {sorted.map((visitor) => (
                  <tr key={visitor.id} className="mz-border border-b last:border-b-0">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Link
                        href={`/admin/activity?userId=${encodeURIComponent(visitor.id)}`}
                        className="mz-mono mz-ink text-[13px] underline"
                        title="この人の行動を見る"
                      >
                        {visitor.id}
                      </Link>
                      {visitor.active && (
                        <span
                          className="ml-2 inline-block h-1.5 w-1.5 rounded-full align-middle"
                          style={{ background: 'var(--mz-accent)' }}
                          title="直近1時間に来ています"
                        />
                      )}
                      <span className="mz-ink-faint mz-mono ml-1.5 text-[10px]">
                        板では {displayId(visitor.id)}
                      </span>
                    </td>

                    {/* 訪問回数。この表の主役なので、数字を大きくする */}
                    <td className="px-3 py-2">
                      <span className="mz-mono mz-ink text-[15px] font-bold tabular-nums">
                        {visitor.visits}
                      </span>
                      {visitor.visits >= 2 && (
                        <span className="mz-chip mz-chip-sun ml-1.5">常連</span>
                      )}
                    </td>

                    <td className="mz-mono mz-ink px-3 py-2 text-[12px] tabular-nums">
                      {visitor.posts}
                    </td>
                    <td className="mz-mono mz-ink-sub px-3 py-2 text-[12px] tabular-nums">
                      {visitor.boardViews}
                    </td>
                    <td className="mz-mono mz-ink-sub px-3 py-2 text-[12px] tabular-nums">
                      {visitor.boards}
                    </td>
                    <td className="mz-mono mz-ink-sub px-3 py-2 text-[12px] tabular-nums">
                      {formatDuration(visitor.dwellMs)}
                    </td>
                    <td className="mz-mono mz-ink-sub px-3 py-2 text-[12px] tabular-nums">
                      {visitor.reactions}
                    </td>
                    <td className="mz-mono mz-ink-sub px-3 py-2 text-[12px] tabular-nums">
                      {visitor.guesses}
                    </td>
                    <td className="mz-mono mz-ink-faint px-3 py-2 text-[12px] whitespace-nowrap">
                      {formatDate(visitor.created_at)}
                    </td>
                    <td className="mz-mono mz-ink-sub px-3 py-2 text-[12px] whitespace-nowrap">
                      {formatTime(visitor.last_seen)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function SortableHead({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <th className="px-3 py-2 font-semibold">
      <button
        onClick={onClick}
        className={active ? 'mz-ink font-bold underline' : 'mz-ink-sub underline'}
        title={`${label}で並べ替える`}
      >
        {label}
        {active && <span aria-hidden> ↓</span>}
      </button>
    </th>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="mz-card px-4 py-3">
      <p className="mz-ink-sub text-[11px]">{label}</p>
      <p className="mz-mono mz-ink mt-0.5 text-xl font-bold tabular-nums">{value}</p>
      <p className="mz-ink-faint mt-0.5 text-[10px]">{note}</p>
    </div>
  );
}

/** 滞在時間。秒まで出すと読みにくいので分で丸める */
function formatDuration(ms: number): string {
  if (!ms) return '—';
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return '1分未満';
  if (minutes < 60) return `${minutes}分`;
  return `${Math.floor(minutes / 60)}時間${minutes % 60}分`;
}
