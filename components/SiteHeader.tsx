'use client';

import Link from 'next/link';
import { displayId } from '@/lib/short-id';

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
      <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-2 px-3 sm:gap-3 sm:px-6">
        {backHref && (
          <Link
            href={backHref}
            className="mz-btn-icon -ml-0.5 sm:hidden"
            aria-label="板一覧へ戻る"
          >
            ←
          </Link>
        )}
        {backHref && (
          <Link href={backHref} className="mz-btn mz-btn-sm mz-btn-quiet hidden shrink-0 sm:inline-flex">
            ← 板一覧
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

        {/*
          自分のID。
          これまでは置いてあるだけだった。IDは引き継ぎコードと同じ「自分が誰か」の話
          なので、押せば設定に行けるようにする。設定への入口が板一覧の袖の文章しか
          なかったため、スマホからは辿り着けなかった。
        */}
        <Link
          href="/settings"
          className="mz-chip mz-mono shrink-0 px-2.5 py-1.5 text-[11px]"
          aria-label="あなたのID。引き継ぎコードの画面をひらく"
          title="あなたのID（引き継ぎコードの画面へ）"
        >
          {displayId(userId)}
        </Link>
      </div>
    </header>
  );
}
