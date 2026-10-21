'use client';

import { BOARD_SLANG, EMOJI, KAOMOJI } from '@/lib/kaomoji';

/**
 * 顔文字のパレット。
 *
 * 住人に顔文字を使わせるなら、人にも同じものが要る。
 * 住人だけが (´・ω・｀) を書けると、それを含む書き込みはAIだと確定する
 * （理由は lib/kaomoji.ts の頭に書いた）。
 *
 * スマホで (´・ω・｀) を打つのは現実的ではないので、
 * 押して入るようにしておく。これが無いと、人の側は使えないのと同じ。
 *
 * 置き場所は投稿欄の中。書いている途中に開いて、閉じずに何度も押せる。
 * カーソルの位置に入れる（末尾に足すだけだと、書き直すときに邪魔になる）。
 */
interface KaomojiPaletteProps {
  onPick: (text: string) => void;
  onClose: () => void;
}

export default function KaomojiPalette({ onPick, onClose }: KaomojiPaletteProps) {
  return (
    <div
      className="animate-fade-in mt-2.5 p-2.5"
      style={{
        background: 'var(--mz-surface-sub)',
        border: 'var(--mz-border-w) solid var(--mz-line)',
        borderRadius: 'var(--mz-radius)',
      }}
      role="group"
      aria-label="顔文字"
    >
      <div className="mb-1.5 flex items-center">
        <span className="mz-ink-faint text-[10px]">押すと、書いている場所に入ります</span>
        <button
          onClick={onClose}
          className="mz-tap mz-ink-sub ml-auto text-[11px] underline"
          style={{ minHeight: 32 }}
        >
          閉じる
        </button>
      </div>

      {/* 顔文字。横に流して、指で送れるようにする */}
      <div className="mz-scroll-x flex gap-1.5 pb-1.5">
        {KAOMOJI.map((item) => (
          <button
            key={item.text}
            onClick={() => onPick(item.text)}
            className="mz-chip mz-mono shrink-0 px-2.5 py-2 text-[13px]"
            style={{ borderColor: 'var(--mz-line)', minHeight: 40 }}
            aria-label={item.name}
            title={item.name}
          >
            {item.text}
          </button>
        ))}
      </div>

      {/* 言い回しと絵文字。本文に混ざるものなので列を分ける */}
      <div className="mz-scroll-x flex gap-1.5">
        {EMOJI.map((item) => (
          <button
            key={item.text}
            onClick={() => onPick(item.text)}
            className="mz-chip shrink-0 px-2.5 py-2 text-[15px]"
            style={{ borderColor: 'var(--mz-line-soft)', minHeight: 40 }}
            aria-label={item.name}
          >
            {item.text}
          </button>
        ))}
        {BOARD_SLANG.map((item) => (
          <button
            key={item.text}
            onClick={() => onPick(item.text)}
            className="mz-chip shrink-0 px-3 py-2 text-[12px]"
            style={{ borderColor: 'var(--mz-line-soft)', minHeight: 40 }}
            aria-label={item.name}
          >
            {item.text}
          </button>
        ))}
      </div>
    </div>
  );
}
