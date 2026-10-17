'use client';

import { useState, useEffect } from 'react';
import { ensureUserId } from '@/lib/user';
import SiteHeader from '@/components/SiteHeader';
import Doodle from '@/components/Doodle';

/**
 * ご意見。
 *
 * 送れたか送れなかったかを、画面の中で伝える。
 * 以前は失敗を alert() で出していたので、押して消すまで書いた文章が読めなかった。
 */
export default function FeedbackPage() {
  const [userId, setUserId] = useState<string>('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    ensureUserId().then(setUserId);
  }, []);

  const handleSubmit = async () => {
    if (!content.trim()) return;

    setIsSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          content: content.trim(),
          created_at: Date.now(),
        }),
      });

      if (res.ok) {
        setSubmitted(true);
        setContent('');
        setTimeout(() => setSubmitted(false), 4000);
      } else {
        // 書いたものは消さない。そのまま押し直せるようにする
        setError('送れませんでした。少し待ってもう一度押してください');
      }
    } catch (err) {
      console.error('Failed to submit feedback:', err);
      setError('送れませんでした。通信が切れているかもしれません');
    }

    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen">
      <SiteHeader userId={userId} boardTitle="ご意見" backHref="/" />

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-5 pb-24 sm:px-6">
        <section className="mz-card p-4 sm:p-5">
          <h2 className="mz-display mz-ink mb-1 flex items-center gap-2 text-[17px] font-black">
            <Doodle name="bubble" size={22} fill="var(--mz-sun)" />
            使ってみて気づいたこと
          </h2>
          <p className="mz-ink-sub mb-3 text-[12px] leading-relaxed">
            読むのは作っている側だけです。板には出ません。
            名前は要りません（IDだけが一緒に届きます）。
          </p>

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="書きにくかったところ、噛み合わなかった返事、見づらかった画面など"
            aria-label="ご意見"
            className="mz-field h-56 resize-none"
          />

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              onClick={handleSubmit}
              disabled={!content.trim() || isSubmitting}
              className="mz-btn mz-btn-primary"
            >
              {isSubmitting ? '送信中' : '送る'}
            </button>

            {submitted && (
              <p className="mz-accent animate-fade-in text-[12px] font-bold" role="status">
                送りました。ありがとうございます
              </p>
            )}
            {error && (
              <p
                className="animate-fade-in text-[12px]"
                role="status"
                style={{ color: 'var(--mz-danger)' }}
              >
                {error}
              </p>
            )}
          </div>
        </section>

        <section
          className="mz-surface-sub p-4 sm:p-5"
          style={{
            border: '2px dotted var(--mz-line-soft)',
            borderRadius: 'var(--mz-radius)',
          }}
        >
          <h3 className="mz-ink-sub mb-2 text-[12px] font-bold tracking-[0.12em]">
            答えにくければ、このあたり
          </h3>
          <ul className="mz-ink-sub space-y-1.5 text-[13px] leading-relaxed">
            <li>・返ってきた書き込みは、人が書いたものに見えましたか</li>
            <li>・板の空気は、静かすぎ・騒がしすぎのどちらでしたか</li>
            <li>・書こうとして、やめた瞬間はありましたか</li>
            <li>・見て分からなかった表示はありましたか</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
