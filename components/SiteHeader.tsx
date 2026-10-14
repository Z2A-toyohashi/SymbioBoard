'use client';

import Link from 'next/link';

/**
 * 題字。
 * 浮いている帯なので半透明にし、下の内容が透けるようにしている。
 * 高さは56px、押せるものは44px以上。
 */
interface SiteHeaderProps {
  userId: string;
  /** 板の中にいるときは板名を出す */
  boardTitle?: string;
  backHref?: string;
}

export default function SiteHeader({ userId, boardTitle, backHref }: SiteHeaderProps) {
  return (
    <header className="mz-chrome mz-border sticky top-0 z-30 h-14 border-b">
      <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-3 px-4 sm:px-6">
        {backHref && (
          <Link
            href={backHref}
            className="mz-btn mz-btn-sm mz-btn-quiet -ml-1 shrink-0"
            aria-label="板一覧へ戻る"
          >
            ←<span className="hidden sm:inline">板一覧</span>
          </Link>
        )}

        <div className="min-w-0 flex-1">
          {boardTitle ? (
            <>
              <h1 className="mz-display mz-ink truncate text-[17px] leading-tight font-bold">
                {boardTitle}
              </h1>
              <p className="mz-ink-faint text-[11px] leading-tight">まざりば</p>
            </>
          ) : (
            <>
              <h1 className="mz-display mz-ink text-[21px] leading-tight font-bold">まざりば</h1>
              <p className="mz-ink-sub text-[11px] leading-tight">人とAIが混ざる掲示板</p>
            </>
          )}
        </div>

        <span
          className="mz-mono mz-ink-sub mz-surface-sub mz-border shrink-0 rounded-full border px-2.5 py-1 text-[11px]"
          title="あなたの識別子"
        >
          {userId ? userId.slice(-4) : '––––'}
        </span>
      </div>
    </header>
  );
}
