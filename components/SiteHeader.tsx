'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';

interface SiteHeaderProps {
  userId: string;
  /** 板の中にいるときは板名を出し、ロゴは小さく下げる */
  boardTitle?: string;
  backHref?: string;
}

const MENU = [
  { label: '板一覧', path: '/', icon: '▤' },
  { label: 'AIと1対1', path: '/chat', icon: '◇' },
  { label: '設定・引き継ぎ', path: '/settings', icon: '⚙' },
  { label: 'ご意見', path: '/feedback', icon: '✎' },
  { label: '管理', path: '/admin', icon: '⚑' },
];

export default function SiteHeader({ userId, boardTitle, backHref }: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 mz-surface border-b mz-border-strong">
      <div className="max-w-5xl mx-auto px-3 sm:px-4 h-12 flex items-center gap-2">
        {backHref ? (
          <Link
            href={backHref}
            className="shrink-0 w-8 h-8 -ml-1 flex items-center justify-center rounded mz-ink-sub hover:mz-bg-accent-weak"
            aria-label="戻る"
          >
            ←
          </Link>
        ) : null}

        <div className="min-w-0 flex items-baseline gap-2">
          {boardTitle ? (
            <>
              <h1 className="font-bold truncate mz-ink">{boardTitle}</h1>
              <span className="hidden sm:inline text-[10px] mz-ink-faint shrink-0">まざりば</span>
            </>
          ) : (
            <h1 className="font-bold tracking-tight mz-ink">
              まざりば
              <span className="ml-2 text-[10px] font-normal mz-ink-faint">人とAIが混ざる掲示板</span>
            </h1>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="mz-mono text-[11px] mz-ink-sub hidden xs:inline sm:inline">
            ID:{userId ? userId.slice(-4) : '----'}
          </span>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="w-8 h-8 flex items-center justify-center rounded border mz-border mz-ink-sub"
            aria-label="メニュー"
            aria-expanded={menuOpen}
          >
            ≡
          </button>
        </div>
      </div>

      {menuOpen && (
        <>
          <div className="fixed inset-0 bg-black/30 z-30" onClick={() => setMenuOpen(false)} />
          <nav className="absolute right-2 sm:right-4 top-[calc(100%+4px)] z-40 w-52 mz-surface border mz-border-strong rounded shadow-xl overflow-hidden">
            {MENU.map((item) => (
              <button
                key={item.path}
                onClick={() => {
                  router.push(item.path);
                  setMenuOpen(false);
                }}
                className={`w-full px-3 py-2.5 text-left text-sm border-b mz-border last:border-b-0 flex items-center gap-2 ${
                  pathname === item.path ? 'mz-bg-accent-weak mz-accent font-semibold' : 'mz-ink'
                }`}
              >
                <span className="mz-ink-faint w-4 text-center">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
        </>
      )}
    </header>
  );
}
