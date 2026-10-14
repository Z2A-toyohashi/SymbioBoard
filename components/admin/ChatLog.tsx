'use client';

import { formatTime, getUserColor } from '@/lib/utils';

interface ChatMessage {
  id: string;
  user_id: string;
  role: string;
  content: string;
  media_url?: string;
  media_type?: string;
  created_at: number;
}

interface ChatLogProps {
  messages: ChatMessage[];
}

export default function ChatLog({ messages }: ChatLogProps) {
  // ユーザーごとにグループ化
  const groupedByUser = messages.reduce(
    (acc, msg) => {
      if (!acc[msg.user_id]) {
        acc[msg.user_id] = [];
      }
      acc[msg.user_id].push(msg);
      return acc;
    },
    {} as Record<string, ChatMessage[]>
  );

  return (
    <div className="mz-surface border mz-border p-4 sm:p-6">
      <h2 className="text-lg sm:text-xl font-bold mz-ink-sub mb-4 sm:mb-6 flex items-center gap-2">
        <span>💬</span> 1on1チャットログ
      </h2>

      {messages.length === 0 ? (
        <div className="text-center py-12 mz-ink-faint text-sm">チャットログがまだありません</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedByUser).map(([userId, userMessages]) => (
            <div key={userId} className="mz-surface-sub border mz-border p-4 ">
              <div className="flex items-center gap-2 mb-4 pb-2 border-b-2 mz-border-strong">
                <div
                  className="w-8 h-8 flex items-center justify-center text-xs font-bold"
                  style={{ backgroundColor: getUserColor(userId) }}
                >
                  {userId.slice(-2)}
                </div>
                <span className="font-bold mz-ink-sub">ID: {userId}</span>
                <span className="text-xs mz-ink-faint ml-auto">
                  {userMessages.length}件のメッセージ
                </span>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {userMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] px-3 py-2 text-sm ${
                        msg.role === 'user'
                          ? 'bg-blue-500 '
                          : 'mz-surface mz-ink-sub border mz-border'
                      }`}
                    >
                      {msg.media_url && msg.media_type === 'image' && (
                        <img
                          src={msg.media_url}
                          alt="送信画像"
                          className="max-w-full mb-2 max-h-32 object-contain"
                        />
                      )}
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                      <p
                        className={`text-xs mt-1 ${msg.role === 'user' ? 'text-blue-100' : 'mz-ink-faint'}`}
                      >
                        {formatTime(msg.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
