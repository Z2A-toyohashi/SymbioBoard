'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUserId, setUserId as persistUserId } from '@/lib/user';
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
    const id = getUserId();
    setUserId(id);

    const load = async () => {
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

      <main className="max-w-2xl mx-auto px-3 sm:px-4 py-4 pb-24 space-y-4">
        <section className="border mz-border-strong mz-surface p-4">
          <h2 className="font-bold mz-ink text-[15px] mb-1">このブラウザのあなた</h2>
          <p className="text-[12px] mz-ink-sub mb-3">
            この場に名前はありません。書き込みの横に出る ID
            だけが、同じ人かどうかの手がかりになります。
          </p>
          <div className="mz-mono text-lg mz-ink px-3 py-2 mz-surface-sub border mz-border inline-block">
            ID:{userId.slice(-4)}
          </div>
        </section>

        <section className="border mz-border-strong mz-surface p-4">
          <h2 className="font-bold mz-ink text-[15px] mb-1">引き継ぎコード</h2>
          <p className="text-[12px] mz-ink-sub mb-3">
            パソコンとスマホで同じあなたとして書き込むためのコードです。
            別のブラウザでこのコードを入力すると、そちらもこのIDになります。
            <strong className="mz-ink">他の人には見せないでください。</strong>
          </p>

          <div className="flex items-center gap-2 flex-wrap">
            <code
              className="mz-mono text-[15px] px-3 py-2 border mz-border mz-surface-sub tracking-widest"
              style={{ filter: codeVisible ? 'none' : 'blur(5px)' }}
            >
              {code || '発行中…'}
            </code>
            <button
              onClick={() => setCodeVisible((v) => !v)}
              className="px-3 py-2 border mz-border-strong text-[12px] mz-ink-sub"
            >
              {codeVisible ? '隠す' : '表示する'}
            </button>
            <button
              onClick={copyCode}
              disabled={!code}
              className="px-3 py-2 text-[12px] font-bold disabled:opacity-40"
              style={{ background: 'var(--mz-accent)', color: 'var(--mz-accent-ink)' }}
            >
              {copied ? 'コピーしました' : 'コピー'}
            </button>
          </div>
        </section>

        <section className="border mz-border-strong mz-surface p-4">
          <h2 className="font-bold mz-ink text-[15px] mb-1">別のブラウザから引き継ぐ</h2>
          <p className="text-[12px] mz-ink-sub mb-3">
            元のブラウザで表示したコードを、ここに入力してください。
            いまこのブラウザで書いた内容は、引き継ぎ後は別人の書き込みとして残ります。
          </p>

          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX-XXXX"
              className="mz-mono px-3 py-2 border mz-border-strong tracking-widest focus:outline-none"
              maxLength={14}
            />
            <button
              onClick={handover}
              disabled={input.trim().length < 12}
              className="px-4 py-2 font-bold text-[13px] disabled:opacity-40"
              style={{ background: 'var(--mz-accent)', color: 'var(--mz-accent-ink)' }}
            >
              引き継ぐ
            </button>
          </div>

          {error && (
            <p className="mt-2 text-[12px]" style={{ color: 'var(--mz-danger)' }}>
              {error}
            </p>
          )}
          {message && <p className="mt-2 text-[12px] mz-accent">{message}</p>}
        </section>

        <p className="text-[11px] mz-ink-faint leading-relaxed px-1">
          IDはこのブラウザの Cookie と localStorage の両方に保存しています。
          片方が消えても、もう片方が残っていれば同じあなたのままです。
          両方消えた場合は、このコードで元に戻せます。
        </p>
      </main>
    </div>
  );
}
