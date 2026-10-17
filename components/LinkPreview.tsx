'use client';

import { useEffect, useState } from 'react';
import type { LinkPreview as Preview } from '@/lib/link-preview';

/**
 * 貼られたURLの中身を、札にして本文の下に出す。
 *
 * 出すのは本文の最初のURL1つだけ。
 * 3つ書かれたら札が3枚並んで、本文より飾りのほうが大きくなる。
 *
 * 取れなかったときは何も出さない。
 * 本文の中のURLはそのままリンクになっている（components/RichText.tsx）ので、
 * 押せなくなるわけではない。札が出ないだけ。
 *
 * 写真が読めなかったときは、写真の枠だけ畳んで見出しと相手先を残す。
 * 枠が空いたまま残るより、文字だけのほうが読める。
 */
export default function LinkPreview({ url }: { url: string }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setPreview(null);
    setImageFailed(false);

    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (alive && data?.preview) setPreview(data.preview as Preview);
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [url]);

  if (!preview) return null;

  const showImage = Boolean(preview.image) && !imageFailed;

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="animate-fade-in mt-2 flex max-w-[22rem] overflow-hidden transition-transform active:scale-[0.99]"
      style={{
        background: 'var(--mz-surface-sub)',
        border: 'var(--mz-border-w) solid var(--mz-line)',
        borderRadius: 'var(--mz-radius-sm)',
      }}
    >
      {showImage && (
        // 相手のサーバにある写真なので next/image は使わない
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview.image as string}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
          className="h-[72px] w-[72px] shrink-0 object-cover"
          style={{ borderRight: '1.5px solid var(--mz-line)' }}
        />
      )}

      <span className="min-w-0 flex-1 px-2.5 py-2">
        <span className="mz-ink block truncate text-[13px] leading-snug font-bold">
          {preview.title}
        </span>
        {preview.description && (
          <span className="mz-ink-sub mt-0.5 line-clamp-2 block text-[11px] leading-snug">
            {preview.description}
          </span>
        )}
        <span className="mz-mono mz-ink-faint mt-1 block truncate text-[10px]">
          {preview.siteName || preview.host}
        </span>
      </span>
    </a>
  );
}
