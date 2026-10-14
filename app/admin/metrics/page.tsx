'use client';

import { useEffect, useState } from 'react';
import type { Post, SpaceState } from '@/types';
import { detectSpaceState } from '@/lib/ai-logic';
import MetricsPanel from '@/components/admin/MetricsPanel';
import AdminHeader from '@/components/admin/AdminHeader';

export default function MetricsPage() {
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

      const userPosts = allPosts.filter((p) => p.author_type === 'user');
      const aiPosts = allPosts.filter((p) => p.author_type === 'ai');
      const uniqueUsers = new Set(allPosts.map((p) => p.author_id)).size;
      const aiDensity = allPosts.length > 0 ? aiPosts.length / allPosts.length : 0;
      const spaceState = detectSpaceState(allPosts);

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
        <MetricsPanel stats={stats} />
      </main>
    </div>
  );
}
