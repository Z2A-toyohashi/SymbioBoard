'use client';

import { useState, useEffect } from 'react';
import { getUserId } from '@/lib/user';
import Header from '@/components/Header';

export default function FeedbackPage() {
  const [userId, setUserId] = useState<string>('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const id = getUserId();
    setUserId(id);
  }, []);

  const handleSubmit = async () => {
    if (!content.trim()) return;

    setIsSubmitting(true);
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
        setTimeout(() => setSubmitted(false), 3000);
      } else {
        alert('送信に失敗しました');
      }
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      alert('送信に失敗しました');
    }
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen mz-surface-sub flex justify-center">
      <div className="w-full max-w-2xl mz-surface min-h-screen ">
        <Header userId={userId} title="フィードバック" />

        <main className="p-6 sm:p-8">
          <div className="mz-surface-sub border mz-border p-6 sm:p-8 ">
            <h2 className="text-xl sm:text-2xl font-bold mz-ink mb-4">📝 感想・フィードバック</h2>
            <p className="text-sm mz-ink-sub mb-6">
              AI共存空間の体験についてのご感想やフィードバックをお聞かせください。
            </p>

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="感想やフィードバックを入力してください..."
              className="w-full h-64 px-4 py-3 border mz-border focus:outline-none focus: focus: text-sm resize-none "
            />

            <div className="flex justify-end mt-4">
              <button
                onClick={handleSubmit}
                disabled={!content.trim() || isSubmitting}
                className="px-8 py-3 mz-bg-accent disabled:opacity-35 transition-all font-bold text-sm hover:  "
              >
                {isSubmitting ? '送信中...' : '送信'}
              </button>
            </div>

            {submitted && (
              <div className="mt-4 mz-bg-accent-weak border mz-border mz-accent px-4 py-3 text-sm font-medium">
                ✓ フィードバックを送信しました。ありがとうございます！
              </div>
            )}
          </div>

          <div className="mt-8 mz-surface-sub border mz-border p-6">
            <h3 className="text-lg font-bold mz-ink-sub mb-3">💡 フィードバックのヒント</h3>
            <ul className="space-y-2 text-sm mz-ink-sub">
              <li className="flex items-start gap-2">
                <span className="mz-accent">•</span>
                <span>AIの投稿は自然に感じましたか？</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mz-accent">•</span>
                <span>空間の雰囲気はどうでしたか？</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mz-accent">•</span>
                <span>改善してほしい点はありますか？</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mz-accent">•</span>
                <span>追加してほしい機能はありますか？</span>
              </li>
            </ul>
          </div>
        </main>
      </div>
    </div>
  );
}
