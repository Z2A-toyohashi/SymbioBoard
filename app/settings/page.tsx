'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ensureUserId, setUserId as persistUserId } from '@/lib/user';
import { displayId } from '@/lib/short-id';
import SiteHeader from '@/components/SiteHeader';

/**
 * 引き継ぎ画面。
 *
 * アカウント登録を作らずに「別のブラウザでも同じ自分」を実現する。
 * 仕組みは単純で、サーバが発行した合言葉を別のブラウザで入力すると、
 * そのブラウザのIDが合言葉の持ち主のIDに置き換わる。
 *
 * 匿名掲示板なので守るものはID（と、そのIDに紐づく発言）だけ。
 * メール確認もパスワードも挟まない代わりに、コードは本人以外に見せない前提で扱う。
 */
export default function SettingsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [code, setCode] = useState('');
  const [codeVisible, setCodeVisible] = useState(false);
  const [input, setInput] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const load = async () => {
      const id = await ensureUserId();
      setUserId(id);

      await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id }),
      }).catch(() => {});

      const res = await fetch(`/api/users/handover?userId=${encodeURIComponent(id)}`);
      if (res.ok) {
        const data = await res.json();
        setCode(data.code || '');
      }
    };
    load();
  }, []);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('コピーできませんでした。手で書き写してください');
    }
  };

  const handover = async () => {
    setError('');
    setMessage('');

    const res = await fetch('/api/users/handover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: input }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(data.error || '引き継げませんでした');
      return;
    }

    persistUserId(data.userId);
    setUserId(data.userId);
    setInput('');
    setMessage('引き継ぎました。このブラウザはこれまでのあなたとして扱われます');
    setTimeout(() => router.push('/'), 1500);
  };

  return (
    <div className="min-h-screen">
      <SiteHeader userId={userId} boardTitle="設定・引き継ぎ" backHref="/" />

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-5 pb-24 sm:px-6">
        <section className="mz-card p-4">
          <h2 className="mz-ink mb-1 text-[15px] font-bold">このブラウザのあなた</h2>
          <p className="mz-ink-sub mb-3 text-[12px] leading-relaxed">
            この場に名前はありません。書き込みの横に出る4桁のIDだけが、
            同じ人かどうかの手がかりになります。
          </p>
          <div className="mz-mono mz-ink mz-surface-sub mz-border inline-block rounded-[var(--mz-radius-sm)] border px-3.5 py-2 text-lg">
            ID:{displayId(userId)}
          </div>
        </section>

        <section className="mz-card p-4">
          <h2 className="mz-ink mb-1 text-[15px] font-bold">引き継ぎコード</h2>
          <p className="mz-ink-sub mb-3 text-[12px] leading-relaxed">
            パソコンとスマホで同じあなたとして書き込むためのコードです。
            別のブラウザでこのコードを入力すると、そちらもこのIDになります。
            <strong className="mz-ink">他の人には見せないでください。</strong>
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <code
              className="mz-mono mz-border mz-surface-sub rounded-[var(--mz-radius-sm)] border px-3.5 py-2.5 text-[15px] tracking-widest"
              style={{ filter: codeVisible ? 'none' : 'blur(5px)' }}
            >
              {code || '発行中…'}
            </code>
            <button
              onClick={() => setCodeVisible((v) => !v)}
              className="mz-btn mz-btn-sm mz-btn-quiet"
            >
              {codeVisible ? '隠す' : '表示する'}
            </button>
            <button
              onClick={copyCode}
              disabled={!code}
              className="mz-btn mz-btn-sm mz-btn-primary"
            >
              {copied ? 'コピーしました' : 'コピー'}
            </button>
          </div>
        </section>

        <section className="mz-card p-4">
          <h2 className="mz-ink mb-1 text-[15px] font-bold">別のブラウザから引き継ぐ</h2>
          <p className="mz-ink-sub mb-3 text-[12px] leading-relaxed">
            元のブラウザで表示したコードを、ここに入力してください。
            いまこのブラウザで書いた内容は、引き継ぎ後は別人の書き込みとして残ります。
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX-XXXX"
              aria-label="引き継ぎコード"
              className="mz-field mz-mono w-[15.5em] tracking-widest"
              maxLength={14}
            />
            <button
              onClick={handover}
              disabled={input.trim().length < 12}
              className="mz-btn mz-btn-primary"
            >
              引き継ぐ
            </button>
          </div>

          {error && (
            <p className="mt-2.5 text-[12px]" role="status" style={{ color: 'var(--mz-danger)' }}>
              {error}
            </p>
          )}
          {message && (
            <p className="mz-accent mt-2.5 text-[12px]" role="status">
              {message}
            </p>
          )}
        </section>

        <p className="mz-ink-faint px-1 text-[11px] leading-relaxed">
          IDはこのブラウザの Cookie と localStorage の両方に保存しています。
          片方が消えても、もう片方が残っていれば同じあなたのままです。
          両方消えた場合は、このコードで元に戻せます。
        </p>
      </main>
    </div>
  );
}
