'use client';

import { useMemo, useRef, useState } from 'react';
import type { Stamp } from '@/lib/stamps';
import {
  DEFAULT_STAMP_IDS,
  STAMP_DAILY_LIMIT,
  STAMP_NAME_MAX,
  STAMP_REPORTS_TO_HIDE,
  paletteOrder,
} from '@/lib/stamps';
import type { OwnedStamp } from '@/lib/use-stamps';
import { toStampImage } from '@/lib/stamp-image';
import StampView from './StampView';

/**
 * スタンプを選ぶところ。
 *
 * 下から出る面にしてある。小さな吹き出しに詰めると、
 * 持ち物が増えたときに入りきらないし、スマホでは指で隠れる。
 *
 * 並びには意味がある。上から順に、
 *
 *   1. この板で使われている（まだ持っていないもの）… 増やす入口
 *   2. よく使う … 押しにくる人がいちばん触るところ
 *   3. 自分のスタンプ帳 … 全部
 *   4. つくる
 *
 * 1を最初に置くのが肝で、「誰かが使ったものを自分も押す」と持ち物が増える、
 * という仕組みそのものがここで見える。
 */
interface StampPickerProps {
  stamps: Record<string, Stamp>;
  owned: Record<string, OwnedStamp>;
  /** この板で既に使われているスタンプのID */
  boardStampIds: string[];
  userId?: string;
  onPick: (stampId: string) => void;
  /** 台帳を読み直す */
  onReload: () => void;
  onClose: () => void;
}

export default function StampPicker({
  stamps,
  owned,
  boardStampIds,
  userId,
  onPick,
  onReload,
  onClose,
}: StampPickerProps) {
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');

  const usable = (id: string) => {
    const stamp = stamps[id];
    if (!stamp) return DEFAULT_STAMP_IDS.includes(id);
    return !stamp.disabled;
  };

  /** 持ち物。よく使う順 */
  const myStamps = useMemo(() => {
    const ids = new Set<string>([...DEFAULT_STAMP_IDS, ...Object.keys(owned)]);
    return Array.from(ids)
      .filter(usable)
      .sort((a, b) => {
        const fallback = { use_count: 0, last_used_at: null, acquired_at: 0 };
        return paletteOrder(owned[a] ?? fallback, owned[b] ?? fallback);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owned, stamps]);

  /** この板で使われているが、まだ持っていないもの */
  const newToMe = useMemo(
    () => boardStampIds.filter((id) => usable(id) && !owned[id] && !DEFAULT_STAMP_IDS.includes(id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boardStampIds, owned, stamps]
  );

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return myStamps;
    return myStamps.filter((id) => (stamps[id]?.name || id).includes(q));
  }, [query, myStamps, stamps]);

  return (
    <>
      {/* 外を触れば閉じる */}
      <div className="fixed inset-0 z-40 bg-black/25" onClick={onClose} aria-hidden />

      <div
        className="mz-safe-bottom fixed right-0 bottom-0 left-0 z-50 mx-auto max-h-[78vh] max-w-[680px] overflow-y-auto"
        style={{
          background: 'var(--mz-surface)',
          border: 'var(--mz-border-w) solid var(--mz-line)',
          borderBottom: 'none',
          borderTopLeftRadius: 'var(--mz-radius-lg)',
          borderTopRightRadius: 'var(--mz-radius-lg)',
        }}
        role="dialog"
        aria-label="スタンプを選ぶ"
      >
        <div
          className="mz-chrome sticky top-0 z-10 flex items-center gap-2 px-4 py-3"
          style={{ borderBottom: '1.5px solid var(--mz-line-soft)' }}
        >
          <h2 className="mz-display mz-ink text-[15px] font-black">スタンプ</h2>
          <button onClick={onClose} className="mz-btn-icon ml-auto" aria-label="閉じる">
            ✕
          </button>
        </div>

        <div className="px-4 py-3">
          {newToMe.length > 0 && (
            <Section
              title="この板で使われている"
              note="押すと、次から自分のスタンプ帳に入ります"
            >
              <div className="flex flex-wrap gap-1.5">
                {newToMe.map((id) => (
                  <StampButton
                    key={id}
                    id={id}
                    stamp={stamps[id]}
                    onPick={onPick}
                    badge="＋"
                  />
                ))}
              </div>
            </Section>
          )}

          <Section title={query ? '探している中から' : 'よく使う'}>
            <div className="flex flex-wrap gap-1.5">
              {filtered.slice(0, query ? 60 : 18).map((id) => (
                <StampButton key={id} id={id} stamp={stamps[id]} onPick={onPick} />
              ))}
              {filtered.length === 0 && (
                <p className="mz-ink-faint py-2 text-[12px]">見つかりませんでした</p>
              )}
            </div>
          </Section>

          {myStamps.length > 12 && (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="名前で探す"
              aria-label="スタンプを名前で探す"
              className="mz-field mz-field-pill mb-4"
            />
          )}

          <Section title="つくる">
            {creating ? (
              <CreateForm
                userId={userId}
                onDone={() => {
                  setCreating(false);
                  onReload();
                }}
                onCancel={() => setCreating(false)}
              />
            ) : (
              <button onClick={() => setCreating(true)} className="mz-btn mz-btn-sm mz-btn-quiet">
                ＋ 画像からスタンプを作る
              </button>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4">
      <h3 className="mz-display mz-ink-sub mb-1.5 text-[11px] font-bold tracking-[0.1em]">
        {title}
      </h3>
      {note && <p className="mz-ink-faint mb-1.5 text-[11px] leading-snug">{note}</p>}
      {children}
    </section>
  );
}

function StampButton({
  id,
  stamp,
  onPick,
  badge,
}: {
  id: string;
  stamp?: Stamp;
  onPick: (id: string) => void;
  badge?: string;
}) {
  return (
    <button
      onClick={() => onPick(id)}
      className="relative inline-flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-95"
      style={{ border: '1.5px solid var(--mz-line-soft)', background: 'var(--mz-surface)' }}
      aria-label={stamp?.name || id}
      title={stamp?.name || id}
    >
      <StampView id={id} stamp={stamp} size={24} />
      {badge && (
        <span
          className="mz-mono absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold"
          style={{
            background: 'var(--mz-sun)',
            color: '#17140f',
            border: '1.5px solid var(--mz-line)',
          }}
          aria-hidden
        >
          {badge}
        </span>
      )}
    </button>
  );
}

/**
 * 作るところ。
 *
 * 作ったものは板をまたいで全員に出る。押せば相手の持ち物にも入る。
 * あとから取り消せないので、押す前に何が起きるのかを読んでもらう。
 * 読んだ印（確認）が付くまで、作るボタンは押せない。
 */
function CreateForm({
  userId,
  onDone,
  onCancel,
}: {
  userId?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const choose = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setError('');

    try {
      // 送る前に128px四方へ描き直す。撮影場所などの情報もここで落ちる
      const resized = await toStampImage(picked);
      setFile(resized);
      setPreview(URL.createObjectURL(resized));
      if (!name) setName(picked.name.replace(/\.[^.]+$/, '').slice(0, STAMP_NAME_MAX));
    } catch {
      setError('この画像は使えませんでした。別の画像を選んでください');
    }
  };

  const submit = async () => {
    if (!file || !name.trim() || !userId || !agreed) return;
    setBusy(true);
    setError('');

    try {
      const body = new FormData();
      body.append('image', file);
      body.append('name', name.trim());
      body.append('userId', userId);

      const res = await fetch('/api/stamps', { method: 'POST', body });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        details?: string;
      };

      if (!res.ok) {
        // 「500」だけだと何が起きたのか分からないので、理由も並べて出す
        setError([data.error, data.details].filter(Boolean).join(' / ') || '作れませんでした');
        setBusy(false);
        return;
      }

      onDone();
    } catch {
      setError('作れませんでした');
    }
    setBusy(false);
  };

  return (
    <div className="animate-fade-in">
      <div
        className="mb-3 px-3 py-2.5 text-[11px] leading-relaxed"
        style={{
          background: 'var(--mz-surface-sub)',
          border: '2px dotted var(--mz-line-soft)',
          borderRadius: 'var(--mz-radius-sm)',
        }}
      >
        <p className="mz-ink mb-1 font-bold">作る前に読んでください</p>
        <ul className="mz-ink-sub space-y-0.5">
          <li>・この板だけでなく、すべての板に出ます</li>
          <li>・押した人の持ち物に入り、その人が別の板へ持っていきます</li>
          <li>・押された跡は消せません。名前もあとから変えられません</li>
        </ul>
        <p className="mz-ink-sub mt-1.5">
          人の顔が写った写真、他の人が描いたもの、勤め先や学校が分かるもの、
          見た人が嫌な気持ちになるものは入れないでください。
          通報が{STAMP_REPORTS_TO_HIDE}件集まると自動で止まります。
        </p>
        <p className="mz-ink-faint mt-1.5">
          作れるのは24時間に{STAMP_DAILY_LIMIT}個までです。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => inputRef.current?.click()} className="mz-btn mz-btn-sm mz-btn-quiet">
          画像を選ぶ
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={choose}
          className="hidden"
        />

        {preview && (
          // 作る前の見本。選んだ画像をその場で128pxに直したもの
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="作るスタンプの見本"
            className="h-11 w-11 object-contain"
            style={{
              border: '1.5px solid var(--mz-line-soft)',
              borderRadius: 'var(--mz-radius-sm)',
            }}
          />
        )}
      </div>

      {file && (
        <>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, STAMP_NAME_MAX))}
            placeholder="名前（探すときに使います）"
            aria-label="スタンプの名前"
            className="mz-field mt-3"
          />

          <label className="mz-ink-sub mt-3 flex items-start gap-2 text-[12px] leading-snug">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 shrink-0"
            />
            <span>上を読みました。広がって困るものではありません</span>
          </label>
        </>
      )}

      {error && (
        <p className="mt-2 text-[12px] font-bold" role="status" style={{ color: 'var(--mz-danger)' }}>
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={submit}
          disabled={!file || !name.trim() || !agreed || busy || !userId}
          className="mz-btn mz-btn-sm mz-btn-accent"
        >
          {busy ? '作っています' : '作る'}
        </button>
        <button onClick={onCancel} className="mz-btn mz-btn-sm mz-btn-bare">
          やめる
        </button>
      </div>
    </div>
  );
}
