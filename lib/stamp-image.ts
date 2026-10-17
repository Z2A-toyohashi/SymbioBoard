'use client';

import { STAMP_PIXELS } from './stamps';

/**
 * 選んだ画像を、スタンプの大きさに直す。
 *
 * 送る前に画面側で128px四方に描き直す。理由は3つある。
 *
 *   1. 押された跡は小さくしか出ないので、原寸を送る意味がない
 *   2. 通信とStorageの節約。板に並ぶものなので、軽いほど画面が止まらない
 *   3. canvas に描き直した時点で、撮影場所や端末の情報（Exif）が落ちる
 *      自分の写真をそのままスタンプにする人がいるので、ここは黙って外す
 *
 * 縦横比は保ったまま、余りは透明のままにする（切り取らない）。
 * 顔や文字の端が切れると、何のスタンプか分からなくなるため。
 */
export async function toStampImage(file: File): Promise<File> {
  const bitmap = await loadImage(file);

  const canvas = document.createElement('canvas');
  canvas.width = STAMP_PIXELS;
  canvas.height = STAMP_PIXELS;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('画像を扱えませんでした');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const scale = Math.min(STAMP_PIXELS / bitmap.width, STAMP_PIXELS / bitmap.height);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  ctx.drawImage(
    bitmap,
    Math.round((STAMP_PIXELS - width) / 2),
    Math.round((STAMP_PIXELS - height) / 2),
    width,
    height
  );

  const blob = await new Promise<Blob | null>((resolve) =>
    // 透過を残したいので PNG。128px四方なら十分に小さい
    canvas.toBlob(resolve, 'image/png')
  );

  if (!blob) throw new Error('画像を作れませんでした');

  return new File([blob], 'stamp.png', { type: 'image/png' });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像を読めませんでした'));
    };
    image.src = url;
  });
}
