'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import type { Post } from '@/types';
import { displayId } from '@/lib/short-id';
import KaomojiPalette from './KaomojiPalette';

/**
 * 投稿欄は画面下に固定する。
 * 掲示板は上から下に読むので、読み終わった位置と書く位置が近いほうが自然だし、
 * スマホでは親指が届く範囲に入力欄と送信ボタンが来る。
 * 普段は1行。書き始めると伸びる。
 */
interface PostInputProps {
  onPost: (content: string, mediaUrl?: string, type?: 'text' | 'voice' | 'image') => void;
  placeholder?: string;
  replyTo?: string;
  replyToPost?: Post;
  onCancel?: () => void;
}

/** 書ける長さの上限。これを超えると掲示板の1レスとしては長すぎる */
const MAX_LENGTH = 1000;
/** 残り字数を出しはじめる位置 */
const COUNT_FROM = 800;

export default function PostInput({
  onPost,
  placeholder = 'いま思ったことを書く',
  replyTo,
  replyToPost,
  onCancel,
}: PostInputProps) {
  const [content, setContent] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  /**
   * 失敗の知らせ。
   *
   * 以前は alert() で出していた。アップロードに失敗すると画面全体が止まり、
   * 押して消すまで何も読めない。書こうとしていた文章も見えなくなる。
   * 失敗したのは投稿欄の中の出来事なので、投稿欄の中に出す。
   */
  const [notice, setNotice] = useState('');
  /** 顔文字のパレットを開いているか */
  const [showKaomoji, setShowKaomoji] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /**
   * 顔文字を、いまカーソルがある場所に入れる。
   *
   * 末尾に足すだけだと、書き直している途中に押したときに
   * 思っていない場所へ入る。選んでいる文字があれば置き換える。
   *
   * 入れたあとはカーソルを顔文字の後ろへ戻す。
   * パレットは閉じない（いくつか続けて押せるようにする）。
   */
  const insertKaomoji = (text: string) => {
    const el = textareaRef.current;

    if (!el) {
      setContent((prev) => (prev + text).slice(0, MAX_LENGTH));
      return;
    }

    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const next = (el.value.slice(0, start) + text + el.value.slice(end)).slice(0, MAX_LENGTH);

    setContent(next);
    setExpanded(true);

    // 描き直されたあとでないとカーソルを動かせない
    requestAnimationFrame(() => {
      el.focus();
      const caret = Math.min(start + text.length, next.length);
      el.setSelectionRange(caret, caret);
    });
  };

  /**
   * 投稿欄は画面下に固定なので、本文の末尾がその下に潜り込む。
   * 高さは返信先の表示や画像の有無、入力欄の行数で変わるため、
   * 固定値の余白では足りたり余ったりする。実寸を測って本文側に渡す。
   */
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;

    const apply = () => {
      document.documentElement.style.setProperty('--mz-composer-h', `${el.offsetHeight}px`);
    };

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    window.addEventListener('resize', apply);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', apply);
      document.documentElement.style.removeProperty('--mz-composer-h');
    };
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    if (!content.trim() && !imageFile) return;
    setNotice('');

    let mediaUrl: string | undefined;
    let type: 'text' | 'voice' | 'image' = 'text';

    if (imageFile) {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('image', imageFile);

      try {
        // 本番は Supabase Storage、開発はローカルへ退避する二段構え
        let res = await fetch('/api/upload-supabase', { method: 'POST', body: formData });
        if (!res.ok) {
          res = await fetch('/api/upload', { method: 'POST', body: formData });
        }
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Upload failed');
        }
        const data = await res.json();
        mediaUrl = data.url;
        type = 'image';
      } catch (error) {
        console.error('Upload failed:', error);
        setNotice(
          `画像を送れませんでした（${error instanceof Error ? error.message : '原因不明'}）。文章だけなら、画像を外すと送れます`
        );
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
    }

    onPost(content, mediaUrl, type);
    setContent('');
    setImagePreview(null);
    setImageFile(null);
    setExpanded(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNotice('');

    const reject = (message: string) => {
      setNotice(message);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };

    if (file.size > 5 * 1024 * 1024) {
      reject('画像は5MBまでです');
      return;
    }
    if (!file.type.startsWith('image/')) {
      reject('画像のファイルを選んでください');
      return;
    }

    setImageFile(file);
    setExpanded(true);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.onerror = () => reject('画像を読めませんでした');
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setImagePreview(null);
    setImageFile(null);
    setNotice('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const remaining = MAX_LENGTH - content.length;
  const canSend = (content.trim().length > 0 || imageFile !== null) && !isUploading && remaining >= 0;

  return (
    <div ref={barRef} className="mz-safe-bottom fixed right-0 bottom-0 left-0 z-30">
      <div className="mz-chrome mz-border border-t">
        <div className="mx-auto max-w-[1180px] px-4 sm:px-6 lg:grid lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[260px_minmax(0,1fr)]">
          <div className="hidden lg:block" />
          <div className="lg:max-w-[760px]">
            {replyTo && replyToPost && (
              <div
                className="animate-fade-in mt-2.5 flex items-center gap-2 px-3 py-2 text-[12px]"
                style={{
                  background: 'var(--mz-surface-sub)',
                  border: 'var(--mz-border-w) solid var(--mz-line)',
                  borderRadius: 'var(--mz-radius-pill)',
                }}
              >
                <span className="mz-chip mz-chip-sun shrink-0">返信先</span>
                <span className="mz-mono mz-ink-sub shrink-0">
                  ID:{displayId(replyToPost.author_id)}
                </span>
                <span className="mz-ink-sub min-w-0 flex-1 truncate">{replyToPost.content}</span>
                {onCancel && (
                  <button
                    onClick={onCancel}
                    className="mz-btn-icon shrink-0"
                    style={{ width: 38, height: 38, fontSize: 14, boxShadow: 'none' }}
                    aria-label="返信をやめる"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}

            {imagePreview && (
              <div className="animate-fade-in relative inline-block pt-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreview}
                  alt="送る画像"
                  className="max-h-28"
                  style={{
                    border: 'var(--mz-border-w) solid var(--mz-line)',
                    borderRadius: 'var(--mz-radius-sm)',
                  }}
                />
                <button
                  onClick={clearImage}
                  className="absolute -top-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full text-xs"
                  style={{
                    background: 'var(--mz-ink)',
                    color: 'var(--mz-paper)',
                    border: 'var(--mz-border-w) solid var(--mz-line)',
                  }}
                  aria-label="画像を外す"
                >
                  ✕
                </button>
              </div>
            )}

            {notice && (
              <p
                className="animate-fade-in pt-2 text-[12px] leading-relaxed"
                role="status"
                style={{ color: 'var(--mz-danger)' }}
              >
                {notice}
              </p>
            )}

            <div className="flex items-end gap-2 py-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mz-btn-icon"
                title="画像を選ぶ"
                aria-label="画像を添付"
              >
                ▣
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,image/heic,image/heif"
                onChange={handleImageSelect}
                className="hidden"
              />

              {/*
                顔文字。
                住人が顔文字を使うので、人の側にも同じ入口が要る。
                無いと「顔文字を書けるのは住人だけ」になってしまう（lib/kaomoji.ts）
              */}
              <button
                onClick={() => setShowKaomoji((open) => !open)}
                className="mz-btn-icon"
                title="顔文字を入れる"
                aria-label="顔文字を入れる"
                aria-expanded={showKaomoji}
                style={
                  showKaomoji
                    ? { background: 'var(--mz-sun)', color: '#17140f', fontSize: 13 }
                    : { fontSize: 13 }
                }
              >
                ｗ
              </button>

              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setExpanded(true)}
                placeholder={replyTo ? '返信を書く' : placeholder}
                rows={expanded ? 3 : 1}
                aria-label={replyTo ? '返信' : '書き込み'}
                className={`mz-field min-w-0 flex-1 resize-none ${expanded ? '' : 'mz-field-pill'}`}
              />

              <button
                onClick={handleSubmit}
                disabled={!canSend}
                className="mz-btn mz-btn-primary shrink-0"
              >
                {isUploading ? '送信中' : '書く'}
              </button>
            </div>

            {showKaomoji && (
              <KaomojiPalette onPick={insertKaomoji} onClose={() => setShowKaomoji(false)} />
            )}

            {/* 書き始めてから出す。普段は1行分の高さに収める */}
            {expanded && (
              <div className="mz-ink-faint flex items-baseline gap-3 pb-2 text-[10px]">
                <span>Cmd / Ctrl + Enter でも投稿できます</span>
                {content.length >= COUNT_FROM && (
                  <span
                    className="mz-mono ml-auto tabular-nums"
                    style={{ color: remaining < 0 ? 'var(--mz-danger)' : undefined }}
                  >
                    残り {remaining}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
