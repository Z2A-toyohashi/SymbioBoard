'use client';

import { formatTime } from '@/lib/utils';

interface Feedback {
  id: string;
  user_id: string;
  content: string;
  created_at: number;
}

interface FeedbackLogProps {
  feedback: Feedback[];
}

export default function FeedbackLog({ feedback }: FeedbackLogProps) {
  return (
    <div className="mz-surface border mz-border p-4 sm:p-6">
      <h2 className="text-lg sm:text-xl font-bold mz-ink-sub mb-4 sm:mb-6 flex items-center gap-2">
        <span>💬</span> フィードバック一覧
      </h2>

      <div className="space-y-4">
        {feedback.length === 0 ? (
          <div className="text-center py-12 mz-ink-faint text-sm">
            フィードバックがまだありません
          </div>
        ) : (
          feedback.map((item) => (
            <div key={item.id} className="mz-surface-sub border mz-border p-4 ">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold mz-accent">ID: {item.user_id}</span>
                <span className="text-xs mz-ink-faint">{formatTime(item.created_at)}</span>
              </div>
              <p className="text-sm mz-ink-sub whitespace-pre-wrap break-words">{item.content}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
