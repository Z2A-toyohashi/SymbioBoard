'use client';

import AdminHeader from '@/components/admin/AdminHeader';
import ActivityLog from '@/components/admin/ActivityLog';

/**
 * 人の行動の記録。
 *
 * 「書き込み」の隣に置いた。あちらは結果（何が書かれたか）、
 * こちらは経過（どこを見て、何を押して、どれだけ読んだか）。
 */
export default function ActivityPage() {
  return (
    <div className="min-h-screen">
      <AdminHeader />
      <main className="mx-auto max-w-[1180px] px-4 py-6 pb-28 sm:px-6">
        <h2 className="mz-ink mb-1 text-[20px] font-bold tracking-[-0.01em]">行動の記録</h2>
        <p className="mz-ink-sub mb-5 text-[12px] leading-relaxed">
          読んだ・押した・見立てた・板を移ったところまで残しています。
          板の側には、いまもどの書き込みが人かAIかは出していません。
        </p>
        <ActivityLog />
      </main>
    </div>
  );
}
