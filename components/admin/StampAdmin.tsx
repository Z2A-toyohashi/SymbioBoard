'use client';

import { useEffect, useState } from 'react';
import type { Stamp } from '@/lib/stamps';
import { STAMP_REPORTS_TO_HIDE, isDefaultStamp } from '@/lib/stamps';
import { displayId } from '@/lib/short-id';
import StampView from '../StampView';

/**
 * スタンプの管理。
 *
 * 誰でも作れるようにしてあるので、出続けると困るものを止める場所が要る。
 * 止めるだけで、消しはしない。消すと過去のレスに押された跡まで消えて、
 * そのときの会話が読めなくなるため。止めたものは跡だけが「×」で残る。
 *
 * 通報が溜まったものは、人が見るまでの間だけ自動で止まっている。
 * 見て問題がなければ、ここから戻す。
 */
export default function StampAdmin() {
  const [stamps, setStamps] = useState<Stamp[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch('/api/stamps');
      const data = await res.json();
      setStamps((data.stamps || []).filter((s: Stamp) => !isDefaultStamp(s.id)));
    } catch (error) {
      console.error('Failed to load stamps:', error);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const setDisabled = async (stampId: string, disabled: boolean) => {
    setBusy(stampId);
    try {
      await fetch('/api/stamps', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stampId, disabled }),
      });
      await load();
    } catch (error) {
      console.error('Failed to update stamp:', error);
    }
    setBusy(null);
  };

  const reported = stamps.filter((s) => (s.report_count || 0) > 0 || s.disabled);
  const rest = stamps.filter((s) => !reported.includes(s));

  return (
    <section className="mz-card p-4">
      <h2 className="mz-display mz-ink mb-1 text-[15px] font-bold">作られたスタンプ</h2>
      <p className="mz-ink-sub mb-3 text-[12px] leading-relaxed">
        通報が{STAMP_REPORTS_TO_HIDE}件集まると自動で止まります。
        止めても消えません（押された跡は「×」で残ります）。既定の6個はここに出ません。
      </p>

      {loading ? (
        <p className="mz-ink-faint text-[12px]">読み込み中…</p>
      ) : stamps.length === 0 ? (
        <p className="mz-ink-faint text-[12px]">まだ誰も作っていません</p>
      ) : (
        <div className="space-y-4">
          {reported.length > 0 && (
            <Group title="通報あり・止まっているもの" stamps={reported}>
              {(stamp) => (
                <Row key={stamp.id} stamp={stamp} busy={busy === stamp.id} onToggle={setDisabled} />
              )}
            </Group>
          )}
          {rest.length > 0 && (
            <Group title="そのほか" stamps={rest}>
              {(stamp) => (
                <Row key={stamp.id} stamp={stamp} busy={busy === stamp.id} onToggle={setDisabled} />
              )}
            </Group>
          )}
        </div>
      )}
    </section>
  );
}

function Group({
  title,
  stamps,
  children,
}: {
  title: string;
  stamps: Stamp[];
  children: (stamp: Stamp) => React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mz-ink-sub mb-1.5 text-[11px] font-bold tracking-[0.1em]">{title}</h3>
      <div className="mz-border overflow-hidden rounded-[var(--mz-radius-sm)] border">
        {stamps.map(children)}
      </div>
    </div>
  );
}

function Row({
  stamp,
  busy,
  onToggle,
}: {
  stamp: Stamp;
  busy: boolean;
  onToggle: (id: string, disabled: boolean) => void;
}) {
  return (
    <div className="mz-border flex items-center gap-3 border-b p-2.5 last:border-b-0">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center"
        style={{
          border: '1.5px solid var(--mz-line-soft)',
          borderRadius: 'var(--mz-radius-sm)',
          background: 'var(--mz-surface-sub)',
        }}
      >
        {/* 止めたものも、判断するために管理画面では中身を見せる */}
        <StampView id={stamp.id} stamp={{ ...stamp, disabled: false }} size={28} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="mz-ink truncate text-[13px] font-bold">{stamp.name}</p>
        <p className="mz-mono mz-ink-faint text-[11px]">
          ID:{stamp.created_by ? displayId(stamp.created_by) : '––––'}
          {(stamp.report_count || 0) > 0 && ` / 通報 ${stamp.report_count}`}
          {stamp.disabled && ' / 止まっている'}
        </p>
      </div>

      <button
        onClick={() => onToggle(stamp.id, !stamp.disabled)}
        disabled={busy}
        className={`mz-btn mz-btn-sm shrink-0 ${stamp.disabled ? 'mz-btn-quiet' : 'mz-btn-primary'}`}
      >
        {busy ? '…' : stamp.disabled ? '戻す' : '止める'}
      </button>
    </div>
  );
}
