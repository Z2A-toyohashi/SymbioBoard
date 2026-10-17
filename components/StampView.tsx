import type { Stamp } from '@/lib/stamps';

/**
 * スタンプ1個の見た目。
 *
 * 既定のものは絵文字の文字、作られたものは画像。
 *
 * 台帳に無いIDが来たら、そのIDを文字としてそのまま出す。
 * スタンプが消えても、押された跡だけは読めるようにしておくため。
 * 止められたものは、画像を出さずに印だけ残す。中身を見せずに跡は残す。
 */
export default function StampView({
  id,
  stamp,
  size = 18,
}: {
  id: string;
  stamp?: Stamp;
  size?: number;
}) {
  if (stamp?.disabled) {
    return (
      <span
        className="mz-ink-faint inline-flex items-center justify-center"
        style={{ width: size, height: size, fontSize: size * 0.8 }}
        title="止まっているスタンプ"
        aria-label="止まっているスタンプ"
      >
        ×
      </span>
    );
  }

  if (stamp?.kind === 'image' && stamp.image_url) {
    return (
      // スタンプは Supabase Storage の外部URLなので next/image は使わない
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={stamp.image_url}
        alt={stamp.name}
        title={stamp.name}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className="inline-block object-contain"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span style={{ fontSize: size, lineHeight: 1 }} title={stamp?.name}>
      {id}
    </span>
  );
}
