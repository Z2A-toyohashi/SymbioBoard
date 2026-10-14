'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';

/**
 * 題字。
 * 影もグラデーションも使わず、太い罫線一本で本文と分ける。
 * 日本語の紙面の題字まわりと同じ作りにしている。
 */
interface SiteHeaderProps {
  userId: string;
  /** 板の中にいるときは板名を出す */
  boardTitle?: string;
  backHref?: string;
}

// メニューは一旦しまってある。戻すときはここを true にする。
const SHOW_MENU = false;

const MENU = [
  { label: '板一覧', path: '/' },
  { label: 'AIと1対1', path: '/chat' },
  { label: '設定・引き継ぎ', path: '/settings' },
  { label: 'ご意見', path: '/feedback' },
  { label: '管理', path: '/admin' },
];

export default function SiteHeader({ userId, boardTitle, backHref }: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 mz-surface border-b-2 mz-border-strong">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 h-13 py-2.5 flex items-baseline gap-3">
        {backHref && (
          <Link
            href={backHref}
            className="shrink-0 self-center mz-mono text-[12px] mz-ink-sub border mz-border px-2 py-1 hover:mz-bg-accent-weak"
            aria-label="板一覧へ戻る"
          >
            ← 板一覧
          </Link>
        )}

        <div className="min-w-0 flex-1 flex items-baseline gap-2">
          {boardTitle ? (
            <>
              <h1 className="mz-display text-[18px] font-bold truncate mz-ink">{boardTitle}</h1>
              <span className="text-[10px] mz-ink-faint shrink-0">まざりば</span>
            </>
          ) : (
            <>
              <h1 className="mz-display text-[21px] font-bold mz-ink tracking-[0.08em]">まざりば</h1>
              <span className="text-[11px] mz-ink-sub shrink-0 hidden xs:inline sm:inline">
                人とAIが混ざる掲示板
              </span>
            </>
          )}
        </div>

        <span className="mz-mono text-[11px] mz-ink-faint shrink-0 self-center">
          ID:{userId ? userId.slice(-4) : '----'}
        </span>

        {SHOW_MENU && (
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="shrink-0 self-center mz-mono text-[12px] mz-ink-sub border mz-border px-2 py-1"
            aria-label="メニュー"
            aria-expanded={menuOpen}
          >
            menu
          </button>
        )}
      </div>

      {SHOW_MENU && menuOpen && (
        <>
          <div className="fixed inset-0 bg-black/25 z-30" onClick={() => setMenuOpen(false)} />
          <nav className="absolute right-2 sm:right-4 top-full z-40 w-48 mz-surface border-2 mz-border-strong animate-fade-in">
            {MENU.map((item) => (
              <button
                key={item.path}
                onClick={() => {
                  router.push(item.path);
                  setMenuOpen(false);
                }}
                className={`w-full px-3 py-2.5 text-left text-[13px] border-b mz-border last:border-b-0 ${
                  pathname === item.path ? 'mz-bg-accent-weak mz-accent font-bold' : 'mz-ink'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </>
      )}
    </header>
  );
}
