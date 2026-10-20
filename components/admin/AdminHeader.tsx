'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * 管理画面のナビ。
 * 「設定」と「記録を見る」を分けた。前者は場の性格を決める操作、後者は結果を読む行為で、
 * 頭の使い方が違うものが同じ列に並んでいたのが元の分かりにくさの原因だった。
 */
const SETTINGS = [{ label: '場の設定', path: '/admin' }];

const RECORDS = [
  { label: '書き込み', path: '/admin/posts' },
  { label: '行動', path: '/admin/activity' },
  { label: '1対1ログ', path: '/admin/chat-log' },
  { label: 'ご意見', path: '/admin/feedback' },
  { label: '数値', path: '/admin/metrics' },
];

export default function AdminHeader() {
  const pathname = usePathname();

  const Item = ({ label, path }: { label: string; path: string }) => (
    <Link
      href={path}
      className={`px-3 py-1.5 text-[13px] whitespace-nowrap ${
        pathname === path ? 'mz-bg-accent font-bold' : 'mz-ink-sub border mz-border'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="sticky top-0 z-30 mz-surface border-b mz-border-strong">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-2">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="font-bold mz-ink">まざりば 管理</h1>
          <Link href="/" className="ml-auto text-[12px] mz-ink-sub underline">
            掲示板へ戻る
          </Link>
        </div>

        <nav className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {SETTINGS.map((item) => (
            <Item key={item.path} {...item} />
          ))}
          <span className="mz-ink-faint px-1">|</span>
          {RECORDS.map((item) => (
            <Item key={item.path} {...item} />
          ))}
        </nav>
      </div>
    </header>
  );
}
