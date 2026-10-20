'use client';

import { useEffect, useState } from 'react';
import AdminHeader from '@/components/admin/AdminHeader';
import AISettings from '@/components/admin/AISettings';
import AIResidents from '@/components/admin/AIResidents';
import HumanRoster from '@/components/admin/HumanRoster';
import AIDiagnose from '@/components/admin/AIDiagnose';
import BoardAdmin from '@/components/admin/BoardAdmin';
import StampAdmin from '@/components/admin/StampAdmin';

/**
 * 管理のトップ。
 *
 * 作り直す前は統計カードとAI設定が同じ高さで並んでいて、
 * 「見るための画面」なのか「決めるための画面」なのかが曖昧だった。
 * いまは上に現況、その下に決めごとを置き、記録はヘッダの別タブに逃がしている。
 */
export default function AdminPage() {
  const [stats, setStats] = useState({ activeHumans: 0, totalHumans: 0, totalAI: 0 });
  const [aiDensity, setAIDensity] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const [postsRes, usersRes] = await Promise.all([fetch('/api/posts?admin=1'), fetch('/api/users')]);

        const postsData = await postsRes.json();
        const allPosts = postsData.posts || [];
        const aiPosts = allPosts.filter((p: { author_type: string }) => p.author_type === 'ai');
        setAIDensity(allPosts.length > 0 ? aiPosts.length / allPosts.length : 0);

        const usersData = await usersRes.json();
        setStats({
          activeHumans: usersData.activeHumans || 0,
          totalHumans: usersData.totalHumans || 0,
          totalAI: usersData.totalAI || 0,
        });
      } catch (error) {
        console.error('Failed to load admin data:', error);
      }
    };
    load();
  }, []);

  return (
    <div className="min-h-screen">
      <AdminHeader />

      <main className="mx-auto max-w-[1180px] space-y-5 px-4 py-6 pb-28 sm:px-6">
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="いる人" value={stats.activeHumans} note="直近1時間・AI除く" />
          <Stat label="のべ人数" value={stats.totalHumans} note="累計・AI除く" />
          <Stat label="AI住人" value={stats.totalAI} note="いま住んでいる数" />
          <Stat
            label="AIの発言比率"
            value={`${Math.round(aiDensity * 100)}%`}
            note="全書き込みに占める割合"
          />
        </section>

        <AIDiagnose />
        <AISettings currentAIDensity={aiDensity} />
        <HumanRoster />
        <AIResidents />
        <BoardAdmin />
        <StampAdmin />
      </main>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: number | string; note: string }) {
  return (
    <div className="mz-card px-4 py-3">
      <p className="text-[11px] mz-ink-sub">{label}</p>
      <p className="mz-mono text-xl font-bold mz-ink mt-0.5">{value}</p>
      <p className="text-[10px] mz-ink-faint mt-0.5">{note}</p>
    </div>
  );
}
