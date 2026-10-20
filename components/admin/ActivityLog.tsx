'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatTime } from '@/lib/utils';
import { displayId } from '@/lib/short-id';

/**
 * 人の行動の記録。
 *
 * これまで管理画面で見られたのは「書き込み」だけだった。
 * 書かれたものは結果で、知りたいのはそこに至るまでの動き
 * （どの板を開いて、どれだけ読んで、何を押して、何も書かずに帰ったか）。
 * 書き込みログだけを見ていると、一度も書かなかった人が存在しないことになる。
 *
 * 画面は2段。上がひとりずつの合計、下が1件ずつの流れ。
 * 先に「誰が何回来ているか」を見て、気になるIDで絞って流れを読む、という順。
 *
 * 行動の名前は logs.event_type に入っている英語のまま持ち、
 * 日本語はここで当てる。データ側を日本語にすると、
 * 名前を変えたときに過去の記録が読めなくなる。
 */

/** 行動の訳。増やしたら lib/activity.ts と app/api/activity/route.ts にも足す */
const LABELS: Record<string, string> = {
  view_boards: '板一覧を見た',
  view_board: '板を開いた',
  leave_board: '板を離れた',
  open_thread_tail: '落ちたスレッドを開いた',
  reaction_add: 'スタンプを押した',
  reaction_remove: 'スタンプを取り消した',
  guess: '見立てた',
  favorite_add: 'お気に入りに入れた',
  favorite_remove: 'お気に入りから外した',
  board_create: '板を立てた',
  board_close: '板を閉じた',
  stamp_create: 'スタンプを作った',
  post_delete: '書き込みを消した',
  reply_open: '返信を書きはじめた',
  // 以前からある記録
  post: '書き込んだ',
  reply: '返信した',
  view: '見た',
  ai_intervention: '住人が書いた',
  ai_image: '住人が写真を作った',
  ai_search: '住人が調べた',
  ai_stamp: '住人がスタンプを作った',
};

interface LogRow {
  id: string;
  event_type: string;
  user_id: string;
  metadata: Record<string, unknown> | null;
  created_at: number;
}

interface Summary {
  userId: string;
  isAI: boolean;
  counts: Record<string, number>;
  total: number;
  boards: string[];
  dwellMs: number;
  firstAt: number;
  lastAt: number;
}

export default function ActivityLog() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [eventCounts, setEventCounts] = useState<Record<string, number>>({});
  const [boards, setBoards] = useState<Array<{ id: string; title: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [scanned, setScanned] = useState(0);
  const [window_, setWindow] = useState(0);

  const [humansOnly, setHumansOnly] = useState(true);
  const [userId, setUserId] = useState('');
  const [event, setEvent] = useState('');
  const [boardId, setBoardId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (humansOnly) query.set('humansOnly', '1');
      if (userId) query.set('userId', userId);
      if (event) query.set('event', event);
      if (boardId) query.set('boardId', boardId);

      const res = await fetch(`/api/logs?${query.toString()}`, { cache: 'no-store' });
      const data = await res.json();

      setLogs(data.logs || []);
      setSummaries(data.summaries || []);
      setEventCounts(data.eventCounts || {});
      setBoards(data.boards || []);
      setScanned(data.scanned || 0);
      setWindow(data.window || 0);
    } catch (error) {
      console.error('Failed to load activity:', error);
    }
    setLoading(false);
  }, [humansOnly, userId, event, boardId]);

  useEffect(() => {
    load();
  }, [load]);

  const boardTitle = useMemo(() => {
    const map = new Map(boards.map((b) => [b.id, b.title]));
    return (id: unknown) => (typeof id === 'string' ? map.get(id) || id : '—');
  }, [boards]);

  /** 行動の種類の選択肢。記録にあるものだけを出す（無い種類を選べても空振りする） */
  const eventOptions = useMemo(
    () => Object.entries(eventCounts).sort((a, b) => b[1] - a[1]),
    [eventCounts]
  );

  return (
    <div className="space-y-5">
      {/* 絞り込み */}
      <section className="mz-card p-4 sm:p-5">
        <h3 className="mz-ink mb-3 text-[17px] font-bold tracking-[-0.01em]">絞り込み</h3>

        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <label className="mz-ink-sub flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={humansOnly}
              onChange={(e) => setHumansOnly(e.target.checked)}
            />
            人だけ（AI住人を除く）
          </label>

          <select
            value={event}
            onChange={(e) => setEvent(e.target.value)}
            className="mz-field"
            style={{ maxWidth: 240 }}
            aria-label="行動の種類"
          >
            <option value="">すべての行動</option>
            {eventOptions.map(([key, count]) => (
              <option key={key} value={key}>
                {LABELS[key] || key}（{count}）
              </option>
            ))}
          </select>

          <select
            value={boardId}
            onChange={(e) => setBoardId(e.target.value)}
            className="mz-field"
            style={{ maxWidth: 240 }}
            aria-label="板"
          >
            <option value="">すべての板</option>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>

          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="IDで絞る（完全一致）"
            className="mz-field"
            style={{ maxWidth: 220 }}
            aria-label="利用者のID"
          />

          <button onClick={load} className="mz-btn mz-btn-sm mz-btn-quiet">
            読み直す
          </button>
        </div>

        <p className="mz-ink-faint mt-2.5 text-[11px] leading-relaxed">
          合計は直近{window_}件の記録から作っています（いま{scanned}件を見ました）。
          これに達しているときは、それより前の記録は数えていません。
          <br />
          滞在時間は、板を開いてから離れるまでを足したもの。裏に回っている間は数えません。
        </p>
      </section>

      {/* ひとりずつ */}
      <section className="mz-card p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-baseline gap-2">
          <h3 className="mz-ink text-[17px] font-bold tracking-[-0.01em]">ひとりずつ</h3>
          <span className="mz-mono mz-ink-sub text-[13px]">{summaries.length}人</span>
        </div>

        {loading ? (
          <p className="mz-ink-faint py-6 text-center text-sm">読み込み中…</p>
        ) : summaries.length === 0 ? (
          <p className="mz-ink-faint py-6 text-center text-sm">記録がありません</p>
        ) : (
          <div className="mz-border overflow-x-auto rounded-[var(--mz-radius-sm)] border">
            <table className="w-full text-left">
              <thead>
                <tr className="mz-surface-sub mz-border mz-ink-sub border-b text-[11px]">
                  <th className="px-3 py-2 font-semibold">ID</th>
                  <th className="px-3 py-2 font-semibold">行動</th>
                  <th className="px-3 py-2 font-semibold">書いた</th>
                  <th className="px-3 py-2 font-semibold">開いた板</th>
                  <th className="px-3 py-2 font-semibold">読んでいた時間</th>
                  <th className="px-3 py-2 font-semibold">押した</th>
                  <th className="px-3 py-2 font-semibold">見立て</th>
                  <th className="px-3 py-2 font-semibold">最後</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((s) => {
                  const wrote = (s.counts.post || 0) + (s.counts.reply || 0);
                  return (
                    <tr key={s.userId} className="mz-border border-b last:border-b-0">
                      <td className="px-3 py-2">
                        <button
                          onClick={() => setUserId(s.userId)}
                          className="mz-mono mz-ink text-[13px] underline"
                          title="このIDで絞る"
                        >
                          {s.userId}
                        </button>
                        {s.isAI && <span className="mz-chip mz-chip-quiet ml-2">AI</span>}
                      </td>
                      <td className="mz-mono mz-ink px-3 py-2 text-[12px] tabular-nums">
                        {s.total}
                      </td>
                      <td className="mz-mono mz-ink px-3 py-2 text-[12px] tabular-nums">{wrote}</td>
                      <td className="mz-mono mz-ink-sub px-3 py-2 text-[12px] tabular-nums">
                        {s.boards.length}
                      </td>
                      <td className="mz-mono mz-ink-sub px-3 py-2 text-[12px] tabular-nums">
                        {formatDuration(s.dwellMs)}
                      </td>
                      <td className="mz-mono mz-ink-sub px-3 py-2 text-[12px] tabular-nums">
                        {s.counts.reaction_add || 0}
                      </td>
                      <td className="mz-mono mz-ink-sub px-3 py-2 text-[12px] tabular-nums">
                        {s.counts.guess || 0}
                      </td>
                      <td className="mz-mono mz-ink-faint px-3 py-2 text-[12px]">
                        {formatTime(s.lastAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 1件ずつ */}
      <section className="mz-card p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-baseline gap-2">
          <h3 className="mz-ink text-[17px] font-bold tracking-[-0.01em]">流れ</h3>
          <span className="mz-mono mz-ink-sub text-[13px]">{logs.length}件</span>
          {userId && (
            <button onClick={() => setUserId('')} className="mz-ink-sub text-[12px] underline">
              IDの絞りを外す
            </button>
          )}
        </div>

        {loading ? (
          <p className="mz-ink-faint py-6 text-center text-sm">読み込み中…</p>
        ) : logs.length === 0 ? (
          <p className="mz-ink-faint py-6 text-center text-sm">記録がありません</p>
        ) : (
          <div className="mz-border overflow-x-auto rounded-[var(--mz-radius-sm)] border">
            <table className="w-full text-left">
              <thead>
                <tr className="mz-surface-sub mz-border mz-ink-sub border-b text-[11px]">
                  <th className="px-3 py-2 font-semibold">時刻</th>
                  <th className="px-3 py-2 font-semibold">ID</th>
                  <th className="px-3 py-2 font-semibold">行動</th>
                  <th className="px-3 py-2 font-semibold">板</th>
                  <th className="px-3 py-2 font-semibold">中身</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((row) => (
                  <tr key={row.id} className="mz-border border-b last:border-b-0 align-top">
                    <td className="mz-mono mz-ink-faint px-3 py-2 text-[12px] whitespace-nowrap">
                      {new Date(row.created_at).toLocaleString('ja-JP')}
                    </td>
                    <td className="px-3 py-2">
                      <span className="mz-mono mz-ink text-[12px]">{row.user_id}</span>
                      <span className="mz-ink-faint mz-mono ml-1.5 text-[10px]">
                        板では {displayId(row.user_id)}
                      </span>
                    </td>
                    <td className="mz-ink px-3 py-2 text-[12px] whitespace-nowrap">
                      {LABELS[row.event_type] || row.event_type}
                    </td>
                    <td className="mz-ink-sub px-3 py-2 text-[12px]">
                      {boardTitle((row.metadata || {}).board_id)}
                    </td>
                    <td className="mz-ink-sub px-3 py-2 text-[12px]">
                      {describe(row.metadata)}
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

/** 滞在時間。秒まで出すと読みにくいので分で丸める */
function formatDuration(ms: number): string {
  if (!ms) return '—';
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return '1分未満';
  if (minutes < 60) return `${minutes}分`;
  return `${Math.floor(minutes / 60)}時間${minutes % 60}分`;
}

/**
 * metadata を一行に畳む。
 *
 * 行動ごとに入っている鍵が違うので、形を決め打ちにしない。
 * board_id は別の列に出しているので、ここでは省く。
 */
function describe(metadata: Record<string, unknown> | null): string {
  if (!metadata) return '';

  const parts: string[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (key === 'board_id') continue;
    if (value === null || value === undefined || value === '') continue;

    if (key === 'dwell_ms' && typeof value === 'number') {
      parts.push(`滞在 ${formatDuration(value)}`);
      continue;
    }
    if (key === 'guess') {
      parts.push(value === 'human' ? '人だと思う' : 'AIだと思う');
      continue;
    }
    parts.push(`${key}: ${String(value).slice(0, 120)}`);
  }

  return parts.join(' / ');
}
