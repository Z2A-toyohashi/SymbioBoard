'use client';

import { useState, useRef, forwardRef, useImperativeHandle, Ref } from 'react';
import { analyzeImage } from '@/lib/vision';
import { saveRecord } from '@/lib/storage';

export interface CameraViewHandle {
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  capture: () => void;
  getVideoRef: () => React.RefObject<HTMLVideoElement | null>;
}

const CameraView = forwardRef<CameraViewHandle>((props, ref) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [result, setResult] = useState('');

  // 親コンポーネントから呼び出せるメソッドを公開
  useImperativeHandle(ref, () => ({
    startCamera: toggleCamera,
    stopCamera: () => {
      if (cameraOn) {
        toggleCamera();
      }
    },
    capture,
    getVideoRef: () => videoRef,
  }));

  // カメラ ON/OFF
  const toggleCamera = async () => {
    if (!cameraOn) {
      try {
        // カメラ ON（背面カメラを優先）
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;

          // videoの準備ができるまで待つ（モバイル対応強化）
          await new Promise<void>((resolve, reject) => {
            if (!videoRef.current) {
              reject(new Error('videoRef is null'));
              return;
            }

            const video = videoRef.current;

            // タイムアウト設定（10秒）
            const timeout = setTimeout(() => {
              reject(new Error('カメラの準備がタイムアウトしました'));
            }, 10000);

            video.onloadedmetadata = () => {
              clearTimeout(timeout);
              console.log('カメラのメタデータ読み込み完了');

              // 実際に映像が流れるまで待つ
              const checkReady = () => {
                if (video.readyState >= 2 && video.videoWidth > 0) {
                  console.log('カメラの準備完了:', {
                    readyState: video.readyState,
                    width: video.videoWidth,
                    height: video.videoHeight,
                  });
                  resolve();
                } else {
                  setTimeout(checkReady, 100);
                }
              };
              checkReady();
            };

            video.onerror = (err) => {
              clearTimeout(timeout);
              reject(new Error('カメラの読み込みエラー'));
            };
          });
        }
        setCameraOn(true);
      } catch (err: any) {
        console.error('カメラ起動エラー:', err);
        alert(`カメラの起動に失敗しました: ${err.message}`);
        // ストリームをクリーンアップ
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    } else {
      // カメラ OFF
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCameraOn(false);
    }
  };

  // 撮影して Vision に送る
  const capture = async () => {
    if (!cameraOn) {
      alert('カメラが OFF です。カメラを ON にしてください。');
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);

    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/jpeg')
    );

    const prompt = 'この画像について教えてください。';
    const reply = await analyzeImage(blob, prompt);
    setResult(reply);

    // データを保存（画像ファイルも含む）
    await saveRecord({
      type: 'image',
      prompt,
      ai_response: reply,
      mediaFile: blob,
    });

    // ChatUI にも送る（任意）
    if (typeof window !== 'undefined') {
      (window as any).addChatMessage?.(reply);
    }
  };

  return (
    <div className="space-y-4">
      <video ref={videoRef} autoPlay className="w-full rounded bg-black" />
    </div>
  );
});

CameraView.displayName = 'CameraView';

export default CameraView;
