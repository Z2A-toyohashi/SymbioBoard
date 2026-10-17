/**
 * 本文の中のURLを、押せるリンクにする。
 *
 * 掲示板は書いたものがそのまま並ぶ場なので、本文には何も足さない。
 * 足すのはURLのところだけで、太字や見出しのような書式は入れない。
 *
 * 外に出ていくリンクなので、次の3つを必ず付ける。
 *
 *   target="_blank"   … この板を閉じずに開く。読んでいた場所を失わせない
 *   rel="noopener"    … 開いた先からこのページを操作されないようにする
 *   rel="nofollow"    … 誰でも書ける場所なので、検索の評価を渡さない
 *
 * 受けるのは http と https だけ。javascript: のような書き方は、
 * そもそも URL として拾わない（下の正規表現が先頭で弾く）。
 */

import { URL_PATTERN, tidyUrl } from '@/lib/url-text';

export default function RichText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    // 末尾の句読点は本文側に戻す
    const url = tidyUrl(match[0]);
    if (!url) continue;

    if (start > cursor) parts.push(text.slice(cursor, start));

    parts.push(
      <a
        key={`link-${key++}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="mz-accent font-bold break-all underline underline-offset-2"
        // 本文の上で長押ししたときに、リンクの操作が先に出ないようにする
        onClick={(e) => e.stopPropagation()}
      >
        {url}
      </a>
    );

    cursor = start + url.length;
  }

  if (cursor < text.length) parts.push(text.slice(cursor));

  return <>{parts}</>;
}
