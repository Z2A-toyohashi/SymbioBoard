'use client';

import SiteHeader from './SiteHeader';

/**
 * 旧Headerの置き場所。中身は SiteHeader に寄せた。
 * 既存の画面（1対1チャット・ご意見・設定・about）が同じ呼び方のままで済むように残している。
 */
interface HeaderProps {
  userId: string;
  title?: string;
}

export default function Header({ userId, title }: HeaderProps) {
  return <SiteHeader userId={userId} boardTitle={title} backHref="/" />;
}
