/**
 * 落書き。
 *
 * 余白に置く手描きの絵。内容ではないので、意味は一切載せていない。
 * とくに「どれが人でどれがAIか」は示さない。示した瞬間にこの場が壊れる。
 * 置くのは、空の画面・題字・見出しの脇だけ。文章の上には重ねない。
 *
 * 線はすべて currentColor。地の色が反転しても、そのまま付いてくる。
 * 塗りだけ色を渡せるようにしてある（既定は塗らない）。
 *
 * 画面読み上げには出さない（aria-hidden）。読み上げても意味がないため。
 */

export type DoodleName =
  | 'cloud'
  | 'sparkle'
  | 'star'
  | 'moon'
  | 'sprout'
  | 'bubble'
  | 'mug';

interface DoodleProps {
  name: DoodleName;
  /** 一辺の大きさ(px) */
  size?: number;
  /** 塗りの色。渡さなければ塗らない */
  fill?: string;
  className?: string;
  style?: React.CSSProperties;
}

/** 手描きらしさは線の太さと端の丸さで出す。細くすると製図に見える */
const STROKE = 1.9;

export default function Doodle({ name, size = 24, fill, className, style }: DoodleProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      {SHAPES[name](fill)}
    </svg>
  );
}

const SHAPES: Record<DoodleName, (fill?: string) => React.ReactNode> = {
  /**
   * 顔のある雲。題字の隣に置く印。
   * 掲示板の書き込み（吹き出し）と、場そのもの（空気）を兼ねている。
   */
  cloud: (fill) => (
    <>
      <path
        d="M9.6 23.4c-3.1 0-5.4-2.1-5.4-4.8 0-2.3 1.7-4.2 4-4.6-.1-.4-.2-.9-.2-1.3 0-3.2 2.8-5.8 6.2-5.8 2.6 0 4.9 1.5 5.8 3.7.6-.3 1.2-.4 1.9-.4 2.6 0 4.7 1.9 4.7 4.3 0 .5-.1 1-.3 1.5 1.5.7 2.5 2.1 2.5 3.7 0 2.4-2.1 4.3-4.7 4.3H9.6Z"
        fill={fill || 'none'}
      />
      <path d="M13.2 16.9c.5.5.6 1.4.3 2" />
      <path d="M19.4 16.9c.5.5.6 1.4.3 2" />
    </>
  ),

  /** きらめき。四方に尖った星 */
  sparkle: (fill) => (
    <path
      d="M16 3.5c1.2 7.6 3.7 10.5 12 11.9-8.3 1.4-10.8 4.3-12 11.9-1.2-7.6-3.7-10.5-12-11.9 8.3-1.4 10.8-4.3 12-11.9Z"
      fill={fill || 'none'}
    />
  ),

  /** 星。少しゆがませる */
  star: (fill) => (
    <path
      d="M16 4.2l3.6 7.5 8.1 1-5.9 5.6 1.5 8.1-7.3-3.9-7.2 4.1 1.3-8.2-6-5.4 8.1-1.3L16 4.2Z"
      fill={fill || 'none'}
    />
  ),

  /** 月 */
  moon: (fill) => (
    <path
      d="M24.4 19.8A10.2 10.2 0 0 1 12.4 7.2a9.6 9.6 0 1 0 12 12.6Z"
      fill={fill || 'none'}
    />
  ),

  /** 芽。鉢から伸びる二枚葉 */
  sprout: (fill) => (
    <>
      <path d="M16 27.5V15.8" />
      <path
        d="M16 16.2c-.4-3.4-2.8-5.6-6.4-5.9.2 3.6 2.4 6 6.4 5.9Z"
        fill={fill || 'none'}
      />
      <path
        d="M16 14.6c.5-3.8 3-6.2 7-6.4-.2 4-2.7 6.6-7 6.4Z"
        fill={fill || 'none'}
      />
      <path d="M10.8 27.5h10.4" />
    </>
  ),

  /** 吹き出し */
  bubble: (fill) => (
    <path
      d="M7.5 6.4h17c1.6 0 2.9 1.3 2.9 2.9v9.3c0 1.6-1.3 2.9-2.9 2.9h-8.9l-5.6 4.3.7-4.3h-3.2c-1.6 0-2.9-1.3-2.9-2.9V9.3c0-1.6 1.3-2.9 2.9-2.9Z"
      fill={fill || 'none'}
    />
  ),

  /** 湯気の立つカップ */
  mug: (fill) => (
    <>
      <path
        d="M7.4 13.6h15.2v7.8c0 2.6-2.1 4.7-4.7 4.7h-5.8c-2.6 0-4.7-2.1-4.7-4.7v-7.8Z"
        fill={fill || 'none'}
      />
      <path d="M22.6 16.1h1.6c1.5 0 2.7 1.2 2.7 2.7s-1.2 2.7-2.7 2.7h-1.6" />
      <path d="M12.6 9.6c1-1 1-2.1 0-3.1" />
      <path d="M17.4 9.6c1-1 1-2.1 0-3.1" />
    </>
  ),
};

/**
 * 落書きをばらまく。
 *
 * 空の画面（まだ板がない、まだ誰も書いていない）に置く。
 * 何も無い画面は「壊れている」ように見えるが、絵が一つあるだけで
 * 「まだ何も起きていないだけ」に見える。
 *
 * 位置は決め打ち。乱数にすると、画面を開き直すたびに別物になって落ち着かない。
 */
export function DoodleScatter({ className = '' }: { className?: string }) {
  return (
    <div className={`pointer-events-none select-none ${className}`} aria-hidden="true">
      <Doodle
        name="star"
        size={30}
        fill="var(--mz-sun)"
        className="mz-sway absolute -top-1 left-[12%]"
        style={{ color: 'var(--mz-ink)' }}
      />
      <Doodle
        name="sparkle"
        size={20}
        className="mz-sway absolute top-7 right-[16%]"
        style={{ color: 'var(--mz-ink-faint)', animationDelay: '1.2s' }}
      />
      <Doodle
        name="moon"
        size={26}
        fill="var(--mz-sun)"
        className="mz-sway absolute right-[9%] bottom-2"
        style={{ color: 'var(--mz-ink)', animationDelay: '2.4s' }}
      />
      <Doodle
        name="sprout"
        size={28}
        fill="var(--mz-accent-weak)"
        className="mz-sway absolute bottom-0 left-[9%]"
        style={{ color: 'var(--mz-ink)', animationDelay: '3.1s' }}
      />
    </div>
  );
}
