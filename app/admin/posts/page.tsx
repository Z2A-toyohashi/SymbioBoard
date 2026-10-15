'use client';

import { useEffect, useState } from 'react';
import type { Post, SpaceState } from '@/types';
import { detectSpaceState } from '@/lib/ai-logic';
import AdminHeader from '@/components/admin/AdminHeader';
import { getUserColor, formatTime } from '@/lib/utils';

interface PostWithDetails extends Post {
  reply_count?: number;
  reactions?: Record<string, { count: number; users: Array<{ id: string }> }>;
}

export default function PostsPage() {
  const [posts, setPosts] = useState<PostWithDetails[]>([]);
  const [filter, setFilter] = useState<'all' | 'user' | 'ai'>('all');
  // どのIDがAIかは管理画面でだけ分かればよい。板には出さない
  const [aiIds, setAiIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalPosts: 0,
    userPosts: 0,
    aiPosts: 0,
    totalUsers: 0,
    aiDensity: 0,
    spaceState: 'SILENCE' as SpaceState,
  });

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const res = await fetch('/api/posts');
      const data = await res.json();
      const allPosts: Post[] = data.posts || [];

      // AIの判定は住人名簿から引く。
      // 以前はIDが 'ai-' で始まるかで見ていたが、AIのIDも4桁の数字に揃えた
      const charactersRes = await fetch('/api/ai-characters');
      const charactersData = await charactersRes.json();
      const ids = new Set<string>(
        (charactersData.characters || []).map((c: { id: string }) => c.id)
      );
      setAiIds(ids);

      const userPosts = allPosts.filter((p) => p.author_type === 'user');
      const aiPosts = allPosts.filter((p) => p.author_type === 'ai');
      const uniqueUsers = new Set(allPosts.map((p) => p.author_id)).size;
      const aiDensity = allPosts.length > 0 ? aiPosts.length / allPosts.length : 0;
      const spaceState = detectSpaceState(allPosts);

      // 各投稿のリアクションを取得
      const postsWithDetails = await Promise.all(
        allPosts.map(async (post) => {
          try {
            const reactionsRes = await fetch(`/api/reactions?postId=${post.id}`);
            const reactionsData = await reactionsRes.json();

            return {
              ...post,
              reply_count: allPosts.filter((p) => p.thread_id === post.id).length,
              reactions: reactionsData.reactions || {},
            };
          } catch (error) {
            return {
              ...post,
              reply_count: allPosts.filter((p) => p.thread_id === post.id).length,
              reactions: {},
            };
          }
        })
      );

      setPosts(postsWithDetails);
      setStats({
        totalPosts: allPosts.length,
        userPosts: userPosts.length,
        aiPosts: aiPosts.length,
        totalUsers: uniqueUsers,
        aiDensity,
        spaceState,
      });
      setLoading(false);
    } catch (error) {
      console.error('Failed to load data:', error);
      setLoading(false);
    }
  };

  const handleDelete = async (postId: string) => {
    if (!confirm('この投稿を削除しますか？')) return;

    try {
      const res = await fetch(`/api/posts?id=${postId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        await loadData();
      } else {
        alert('削除に失敗しました');
      }
    } catch (error) {
      console.error('Failed to delete post:', error);
      alert('削除に失敗しました');
    }
  };

  const filteredPosts = posts.filter((post) => {
    if (filter === 'all') return true;
    return post.author_type === filter;
  });

  if (loading) {
    return (
      <div className="min-h-screen mz-paper flex items-center justify-center">
        <div className="w-8 h-8 border mz-border border-t-gray-900 animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen mz-paper">
      <AdminHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 mt-4 sm:mt-6 mb-8">
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
                      リアクション
                    </th>
                    <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-semibold mz-ink-sub">
                      スレッド
                    </th>
                    <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-semibold mz-ink-sub">
                      返信先
                    </th>
                    <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-semibold mz-ink-sub">
                      返信数
                    </th>
                    <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-semibold mz-ink-sub">
                      投稿日時
                    </th>
                    <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-semibold mz-ink-sub">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredPosts.map((post) => {
                    const replyToPost = post.thread_id
                      ? posts.find((p) => p.id === post.thread_id)
                      : null;

                    // デバッグログ
                    if (post.thread_id && !replyToPost) {
                      console.log('返信先が見つからない:', {
                        postId: post.id,
                        threadId: post.thread_id,
                        content: post.content,
                        allPostIds: posts.map((p) => p.id),
                      });
                    }

                    return (
                      <tr
                        key={post.id}
                        className={`hover:mz-surface-sub ${post.thread_id ? 'mz-bg-accent-weak/30' : ''}`}
                      >
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
                          {post.reactions && Object.keys(post.reactions).length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(post.reactions).map(([emoji, info]) => (
                                <div key={emoji} className="group relative">
                                  <div className="flex items-center gap-1 px-2 py-1 mz-surface-sub text-xs">
                                    <span>{emoji}</span>
                                    <span className="font-semibold">{info.count}</span>
                                  </div>
                                  {/* ホバーでユーザー一覧 */}
                                  <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50 whitespace-nowrap">
                                    <div className="bg-gray-900 text-xs px-3 py-2 ">
                                      {info.users.slice(0, 5).map((user, idx) => (
                                        <div key={idx} className="flex items-center gap-1.5">
                                          <div
                                            className="w-2 h-2 "
                                            style={{ backgroundColor: getUserColor(user.id) }}
                                          />
                                          <span>{user.id}</span>
                                          {aiIds.has(user.id) && (
                                            <span className="text-[10px] bg-indigo-500 px-1.5 py-0.5 ">
                                              🤖
                                            </span>
                                          )}
                                        </div>
                                      ))}
                                      {info.users.length > 5 && (
                                        <div className="mz-ink-faint mt-1">
                                          他 {info.users.length - 5}人
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs mz-ink-faint">-</span>
                          )}
                        </td>
                        <td className="px-3 sm:px-4 py-2 sm:py-3">
                          {post.thread_id ? (
                            <span className="inline-flex items-center px-2 py-1 text-xs font-medium mz-bg-accent-weak mz-accent">
                              💬 返信
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 text-xs font-medium mz-surface-sub mz-ink-sub">
                              📝 投稿
                            </span>
                          )}
                        </td>
                        <td className="px-3 sm:px-4 py-2 sm:py-3">
                          {post.thread_id ? (
                            replyToPost ? (
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-4 h-4 flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                                  style={{ backgroundColor: getUserColor(replyToPost.author_id) }}
                                >
                                  {replyToPost.author_id.slice(-2)}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs mz-ink-sub truncate max-w-[150px]">
                                    {replyToPost.author_id}
                                  </p>
                                  <p className="text-xs mz-ink-faint truncate max-w-[150px]">
                                    {replyToPost.content}
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs mz-ink-faint">
                                <span className="font-mono mz-surface-sub px-2 py-1 ">
                                  ID: {post.thread_id.slice(0, 8)}...
                                </span>
                                <p className="text-[10px] text-red-500 mt-1">
                                  ※投稿が削除された可能性
                                </p>
                              </div>
                            )
                          ) : (
                            <span className="text-xs mz-ink-faint">-</span>
                          )}
                        </td>
                        <td className="px-3 sm:px-4 py-2 sm:py-3">
                          <span className="text-xs sm:text-sm mz-ink-sub">
                            {post.reply_count || 0}
                          </span>
                        </td>
                        <td className="px-3 sm:px-4 py-2 sm:py-3">
                          <div className="text-xs sm:text-sm mz-ink-sub whitespace-nowrap">
                            {formatTime(post.created_at)}
                          </div>
                        </td>
                        <td className="px-3 sm:px-4 py-2 sm:py-3">
                          {post.author_type === 'ai' && (
                            <button
                              onClick={() => handleDelete(post.id)}
                              className="text-xs px-3 py-1 bg-red-100 text-red-700 hover:bg-red-200 transition-colors font-medium"
                            >
                              削除
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredPosts.length === 0 && (
              <div className="text-center py-12 mz-ink-faint text-sm">投稿がありません</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
