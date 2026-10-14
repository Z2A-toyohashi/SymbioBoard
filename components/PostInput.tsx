'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import type { Post } from '@/types';

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
  aiNames?: Record<string, string>;
}

export default function PostInput({
  onPost,
  placeholder = 'いま思ったことを書く',
  replyTo,
  replyToPost,
  onCancel,
  aiNames = {},
}: PostInputProps) {
  const [content, setContent] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    if (!content.trim() && !imageFile) return;

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
        alert(
          `画像のアップロードに失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`
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

    if (file.size > 5 * 1024 * 1024) {
      alert('画像サイズは5MB以下にしてください');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (!file.type.startsWith('image/')) {
      alert('画像ファイルを選択してください');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setImageFile(file);
    setExpanded(true);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.onerror = () => {
      alert('画像の読み込みに失敗しました');
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsDataURL(file);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await transcribeAudio(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Recording failed:', error);
      alert('マイクへのアクセスが拒否されました');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');
    try {
      const res = await fetch('/api/transcribe', { method: 'POST', body: formData });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Transcription failed');
      }
      const data = await res.json();
      if (data.text) {
        setContent((prev) => prev + data.text);
        setExpanded(true);
      }
    } catch (error) {
      console.error('Transcription failed:', error);
      alert(
        `音声の文字起こしに失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`
      );
    }
  };

  const canSend = (content.trim().length > 0 || imageFile !== null) && !isUploading;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 mz-safe-bottom">
      <div className="border-t-2 mz-border-strong mz-surface">
        <div className="max-w-4xl mx-auto px-2.5 sm:px-4">
          {replyTo && replyToPost && (
            <div className="flex items-center gap-2 py-2 border-b mz-border text-[12px] animate-fade-in">
              <span
                className="shrink-0 px-1.5 py-0.5 text-[10px] font-bold border"
                style={{ color: 'var(--mz-accent)', borderColor: 'var(--mz-accent)' }}
              >
                返信先
              </span>
              <span
                className="font-bold shrink-0"
                style={{
                  color: replyToPost.author_type === 'ai' ? 'var(--mz-ai)' : 'var(--mz-human)',
                }}
              >
                {replyToPost.author_type === 'ai'
                  ? aiNames[replyToPost.author_id] || 'AI'
                  : '名無し'}
              </span>
              <span className="mz-ink-sub truncate flex-1 min-w-0">{replyToPost.content}</span>
              {onCancel && (
                <button
                  onClick={onCancel}
                  className="shrink-0 w-6 h-6 border mz-border mz-ink-faint"
                  aria-label="返信をやめる"
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {imagePreview && (
            <div className="pt-2 relative inline-block animate-fade-in">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview} alt="プレビュー" className="max-h-28 border mz-border" />
              <button
                onClick={() => {
                  setImagePreview(null);
                  setImageFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="absolute top-3 right-1 w-6 h-6 bg-black/70 text-white text-xs"
              >
                ✕
              </button>
            </div>
          )}

          <div className="flex items-end gap-1.5 py-2.5">
            <button
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onMouseLeave={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              className={`shrink-0 w-10 h-10 border grid place-items-center text-[15px] transition-all ${
                isRecording ? 'opacity-80' : ''
              }`}
              style={
                isRecording
                  ? { background: 'var(--mz-ai)', color: '#fff', borderColor: 'var(--mz-ai)' }
                  : { borderColor: 'var(--mz-line-strong)', color: 'var(--mz-ink-sub)' }
              }
              title="長押しで録音して文字にする"
              aria-label="音声入力"
            >
              ◉
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 w-10 h-10 border mz-border-strong mz-ink-sub grid place-items-center text-[15px] hover:mz-bg-accent-weak transition-colors"
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

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setExpanded(true)}
              placeholder={replyTo ? '返信を書く' : placeholder}
              rows={expanded ? 3 : 1}
              className="flex-1 min-w-0 resize-none border mz-border-strong px-3.5 py-2.5 text-[15px] leading-relaxed focus:outline-none transition-all"
            />

            <button
              onClick={handleSubmit}
              disabled={!canSend}
              className="shrink-0 h-10 px-5 mz-bg-accent font-bold text-[14px] disabled:opacity-35 transition-all"
            >
              {isUploading ? '送信中' : '書く'}
            </button>
          </div>

          {expanded && (
            <p className="pb-2 text-[10px] mz-ink-faint">Cmd / Ctrl + Enter でも投稿できます</p>
          )}
        </div>
      </div>
    </div>
  );
}
