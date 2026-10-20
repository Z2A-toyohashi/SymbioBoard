/**
 * 本文の中のURLと「&gt;&gt;番号」を押せるようにする。
 *
 * 掲示板は書いたものがそのまま並ぶ場なので、本文には何も足さない。
 * 足すのはこの2つだけで、太字や見出しのような書式は入れない。
 *
 * &gt;&gt;番号 をここで扱う理由。
 *   返信欄から付いた宛先は押せるのに、本文に自分で書いた &gt;&gt;3 は
 *   ただの文字だった。住人も人も本文に番号を書くので、同じものが
 *   2通りの振る舞いに見えていた。全角の＝＞＞も同じに扱う。
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

'use client';

import { URL_PATTERN, tidyUrl } from '@/lib/url-text';
import ResRef from './ResRef';

/** 半角と全角の両方。4桁より大きい番号は板に出ないので5桁で止める */
const RES_REF_PATTERN = /(?:>>|＞＞|》)(\d{1,5})/g;

interface RichTextProps {
  text: string;
  /** 押したときに移動する。渡らなければ番号は文字のまま */
  onJumpTo?: (number: number) => void;
  /** 覗いたときに出す中身を引く。無ければ覗けない */
  previewOf?: (number: number) => { authorLabel: string; excerpt: string } | null;
}

export default function RichText({ text, onJumpTo, previewOf }: RichTextProps) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    // 末尾の句読点は本文側に戻す
    const url = tidyUrl(match[0]);
    if (!url) continue;

    if (start > cursor) {
      parts.push(...withResRefs(text.slice(cursor, start), key++, onJumpTo, previewOf));
    }

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

  if (cursor < text.length) {
    parts.push(...withResRefs(text.slice(cursor), key++, onJumpTo, previewOf));
  }

  return <>{parts}</>;
}

/** URLでない区間を、&gt;&gt;番号 のところで割る */
function withResRefs(
  text: string,
  seed: number,
  onJumpTo?: (number: number) => void,
  previewOf?: (number: number) => { authorLabel: string; excerpt: string } | null
): React.ReactNode[] {
  if (!onJumpTo) return [text];

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  for (const match of text.matchAll(RES_REF_PATTERN)) {
    const start = match.index ?? 0;
    const number = Number(match[1]);
    if (!number) continue;

    if (start > cursor) parts.push(text.slice(cursor, start));

    parts.push(
      <ResRef
        key={`ref-${seed}-${key++}`}
        number={number}
        onJump={onJumpTo}
        preview={previewOf?.(number) ?? null}
      />
    );

    cursor = start + match[0].length;
  }

  if (parts.length === 0) return [text];
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}
