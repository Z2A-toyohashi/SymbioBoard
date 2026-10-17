'use client';

import Link from 'next/link';
import { displayId } from '@/lib/short-id';
import Doodle from './Doodle';

/**
 * 題字。
 *
 * 浮いている帯なので半透明にし、下の内容が透けるようにしている。高さは56px。
 * 左端に顔のある雲を置いた。アプリの印であり、この場が雑談の場であることを
 * 文字を読む前に伝える役をしている。板の中ではこの雲が板名の前に付く。
 */
interface SiteHeaderProps {
  userId: string;
  /** 板の中にいるときは板名を出す */
  boardTitle?: string;
  backHref?: string;
}

export default function SiteHeader({ userId, boardTitle, backHref }: SiteHeaderProps) {
  return (
    <header
      className="mz-chrome sticky top-0 z-30 h-14 border-b"
      style={{ borderColor: 'var(--mz-line)', borderBottomWidth: 'var(--mz-border-w)' }}
    >
      <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-2.5 px-3 sm:gap-3 sm:px-6">
        {backHref ? (
          <Link
            href={backHref}
            className="mz-btn-icon -ml-0.5 shrink-0"
            style={{ width: 40, height: 40, fontSize: 16 }}
            aria-label="板一覧へ戻る"
          >
            ←
          </Link>
        ) : (
          <span className="mz-ink shrink-0" aria-hidden>
            <Doodle name="cloud" size={30} fill="var(--mz-sun)" />
          </span>
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
              <h1 className="mz-display mz-ink text-[22px] leading-tight font-black tracking-[-0.03em]">
                まざりば
              </h1>
              <p className="mz-ink-sub text-[11px] leading-tight">人とAIが混ざる掲示板</p>
            </>
          )}
        </div>

        {/*
          自分のID。押せば設定（引き継ぎコード）に行ける。
          IDは「自分が誰か」の話なので、同じところに置いておく。
        */}
        <Link
          href="/settings"
          className="mz-chip mz-mono shrink-0 px-2.5 py-1.5 text-[11px]"
          style={{ boxShadow: 'var(--mz-pop-sm)' }}
          aria-label="あなたのID。引き継ぎコードの画面をひらく"
          title="あなたのID（引き継ぎコードの画面へ）"
        >
          {displayId(userId)}
        </Link>
      </div>
    </header>
  );
}
