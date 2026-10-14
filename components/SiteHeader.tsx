'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { getUserColor } from '@/lib/utils';

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
  const color = userId ? getUserColor(userId) : 'var(--mz-ink-faint)';

  return (
    <header className="sticky top-0 z-30">
      {/* 上端の一本線。板の中かどうかで色が変わる */}
      <div
        className="h-[3px] w-full"
        style={{
          background: boardTitle
            ? 'linear-gradient(90deg, var(--mz-accent), var(--mz-ai))'
            : 'linear-gradient(90deg, var(--mz-accent), var(--mz-accent-deep))',
        }}
      />

      <div
        className="border-b mz-border-strong mz-raise"
        style={{ background: 'color-mix(in srgb, var(--mz-surface) 88%, transparent)', backdropFilter: 'blur(8px)' }}
      >
        <div className="max-w-5xl mx-auto px-3 sm:px-4 h-14 flex items-center gap-2.5">
          {backHref && (
            <Link
              href={backHref}
              className="shrink-0 w-9 h-9 -ml-1 flex items-center justify-center rounded-lg border mz-border mz-ink-sub hover:mz-bg-accent-weak transition-colors"
              aria-label="板一覧へ戻る"
            >
              ←
            </Link>
          )}

          {!boardTitle && (
            <span
              className="shrink-0 w-9 h-9 rounded-lg grid place-items-center mz-display font-black text-[17px] mz-raise-lg"
              style={{ background: 'linear-gradient(145deg, var(--mz-accent), var(--mz-accent-deep))', color: 'var(--mz-accent-ink)' }}
              aria-hidden
            >
              ま
            </span>
          )}

          <div className="min-w-0 flex-1">
            {boardTitle ? (
              <>
                <h1 className="mz-display font-black text-[17px] truncate mz-ink leading-tight">
                  {boardTitle}
                </h1>
                <p className="text-[10px] mz-ink-faint leading-tight">まざりば</p>
              </>
            ) : (
              <>
                <h1 className="mz-display font-black text-[19px] mz-ink leading-tight tracking-wide">
                  まざりば
                </h1>
                <p className="text-[10px] mz-ink-faint leading-tight">人とAIが混ざる掲示板</p>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span
              className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full border mz-border mz-surface-sub"
              title="あなたの識別子"
            >
              <span className="w-2 h-2 rounded-full" style={{ background: color }} />
              <span className="mz-mono text-[11px] mz-ink-sub">
                {userId ? userId.slice(-4) : '----'}
              </span>
            </span>

            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="w-9 h-9 flex flex-col items-center justify-center gap-[3px] rounded-lg border mz-border-strong mz-surface hover:mz-bg-accent-weak transition-colors"
              aria-label="メニュー"
              aria-expanded={menuOpen}
            >
              <span className="block w-4 h-[1.5px] rounded" style={{ background: 'var(--mz-ink-sub)' }} />
              <span className="block w-4 h-[1.5px] rounded" style={{ background: 'var(--mz-ink-sub)' }} />
              <span className="block w-4 h-[1.5px] rounded" style={{ background: 'var(--mz-ink-sub)' }} />
            </button>
          </div>
        </div>
      </div>

      {menuOpen && (
        <>
          <div className="fixed inset-0 bg-black/35 z-30" onClick={() => setMenuOpen(false)} />
          <nav className="absolute right-2 sm:right-4 top-[calc(100%+6px)] z-40 w-56 mz-card mz-raise-lg overflow-hidden animate-fade-in">
            <div className="px-3 py-2 border-b mz-border mz-surface-sub flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
              <span className="mz-mono text-[11px] mz-ink-sub">ID:{userId ? userId.slice(-4) : '----'}</span>
            </div>
            {MENU.map((item) => (
              <button
                key={item.path}
                onClick={() => {
                  router.push(item.path);
                  setMenuOpen(false);
                }}
                className={`w-full px-3 py-3 text-left text-[14px] border-b mz-border last:border-b-0 flex items-center gap-2.5 transition-colors ${
                  pathname === item.path ? 'mz-bg-accent-weak mz-accent font-bold' : 'mz-ink hover:mz-surface-sub'
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
