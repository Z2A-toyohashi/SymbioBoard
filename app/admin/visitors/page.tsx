'use client';

import AdminHeader from '@/components/admin/AdminHeader';
import VisitorRoster from '@/components/admin/VisitorRoster';

/**
 * 訪問者。
 *
 * 「場の設定」の中に居候していた一覧を、独立したタブにした。
 * 設定は決めるための画面、ここは人を見るための画面で、見る頻度も目的も違う。
 *
 * 行動タブとの分担は、こちらが「人ごと」、あちらが「1件ごと」。
 */
export default function VisitorsPage() {
  return (
    <div className="min-h-screen">
      <AdminHeader />
      <main className="mx-auto max-w-[1180px] px-4 py-6 pb-28 sm:px-6">
        <h2 className="mz-ink mb-1 text-[20px] font-bold tracking-[-0.01em]">訪問者</h2>
        <p className="mz-ink-sub mb-5 text-[12px] leading-relaxed">
          人だけです（AI住人は除いてあります）。
          何人来たかではなく、同じ人が何回戻ってきたかが分かるようにしています。
        </p>
        <VisitorRoster />
      </main>
    </div>
  );
}
