'use client';

import type { Post, SpaceState } from '@/types';
import { getUserColor, formatTime } from '@/lib/utils';

interface PostWithDetails extends Post {
  reply_count?: number;
}

interface PostsLogProps {
  posts: PostWithDetails[];
  filter: 'all' | 'user' | 'ai';
  setFilter: (filter: 'all' | 'user' | 'ai') => void;
  stats: {
    totalPosts: number;
    userPosts: number;
    aiPosts: number;
    totalUsers: number;
    aiDensity: number;
    spaceState: SpaceState;
  };
}

export default function PostsLog({ posts, filter, setFilter, stats }: PostsLogProps) {
  const filteredPosts = posts.filter((post) => {
    if (filter === 'all') return true;
    return post.author_type === filter;
  });

  return (
    <div className="mz-surface border mz-border p-4 sm:p-6">
      <h2 className="text-lg sm:text-xl font-bold mz-ink-sub mb-4 sm:mb-6 flex items-center gap-2">
        <span>📝</span> 投稿ログ
      </h2>

      <div className="mz-surface-sub border mz-border p-3 sm:p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 font-medium transition-all text-sm  ${
              filter === 'all'
                ? 'bg-gray-900  '
                : 'mz-surface mz-ink-sub hover:mz-surface-sub border mz-border'
            }`}
          >
            すべて ({stats.totalPosts})
          </button>
          <button
            onClick={() => setFilter('user')}
            className={`px-4 py-2 font-medium transition-all text-sm  ${
              filter === 'user'
                ? 'mz-bg-accent  '
                : 'mz-surface mz-ink-sub hover:mz-bg-accent-weak border mz-border'
            }`}
          >
            👤 ユーザー ({stats.userPosts})
          </button>
          <button
            onClick={() => setFilter('ai')}
            className={`px-4 py-2 font-medium transition-all text-sm  ${
              filter === 'ai'
                ? 'mz-bg-accent  '
                : 'mz-surface mz-ink-sub hover:mz-bg-accent-weak border mz-border'
            }`}
          >
            🤖 AI ({stats.aiPosts})
          </button>
        </div>
      </div>

      <div className="mz-surface border mz-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="mz-surface-sub border-b mz-border">
              <tr>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-semibold mz-ink-sub">
                  タイプ
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-semibold mz-ink-sub">
                  投稿者ID
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-semibold mz-ink-sub">
                  内容
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-semibold mz-ink-sub">
                  返信数
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-semibold mz-ink-sub">
                  投稿日時
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredPosts.map((post) => (
                <tr key={post.id} className="hover:mz-surface-sub">
                  <td className="px-3 sm:px-4 py-2 sm:py-3">
                    {post.author_type === 'ai' ? (
                      <span className="inline-flex items-center px-2 py-1 text-xs font-medium mz-bg-accent-weak mz-accent">
                        🤖 AI
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 text-xs font-medium mz-bg-accent-weak mz-accent">
                        👤 ユーザー
                      </span>
                    )}
                  </td>
                  <td className="px-3 sm:px-4 py-2 sm:py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: getUserColor(post.author_id) }}
                      >
                        {post.author_id.slice(-2)}
                      </div>
                      <span className="text-xs sm:text-sm font-medium mz-ink truncate">
                        {post.author_id}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 sm:px-4 py-2 sm:py-3">
                    <p className="text-xs sm:text-sm mz-ink line-clamp-2 max-w-md">
                      {post.content}
                    </p>
                  </td>
                  <td className="px-3 sm:px-4 py-2 sm:py-3">
                    <span className="text-xs sm:text-sm mz-ink-sub">{post.reply_count || 0}</span>
                  </td>
                  <td className="px-3 sm:px-4 py-2 sm:py-3">
                    <div className="text-xs sm:text-sm mz-ink-sub whitespace-nowrap">
                      {formatTime(post.created_at)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredPosts.length === 0 && (
          <div className="text-center py-12 mz-ink-faint text-sm">投稿がありません</div>
        )}
      </div>
    </div>
  );
}
