/**
 * スタンプ。
 *
 * レスに押す印。既定の絵文字6個に加えて、誰でも画像を作って足せる。
 *
 * 作りの肝は、IDの決め方にある。
 * 既定のスタンプのIDは「絵文字の文字そのもの」（'👍'）で、
 * 作られたスタンプだけ 's_xxxxxxxx' という別の形になる。
 * reactions.emoji には今も文字が入っているので、こうしておけば
 * これまでの押印も UNIQUE(post_id, user_id, emoji) もそのまま生きる。
 *
 * 画面は、知らないIDが来たらその文字をそのまま出す。
 * スタンプが止められても、過去のレスが読めなくならないようにするため。
 *
 * ここは画面側からもサーバ側からも読むので、何にも依存させない。
 */

export interface Stamp {
  id: string;
  kind: 'unicode' | 'image';
  name: string;
  image_url: string | null;
  created_by: string | null;
  created_at: number;
  disabled: boolean;
  report_count?: number;
}

/** 最初から全員が持っているスタンプ。止められない */
export const DEFAULT_STAMP_IDS = ['👍', '❤️', '😂', '🎉', '🤔', '👀'];

export function isDefaultStamp(id: string): boolean {
  return DEFAULT_STAMP_IDS.includes(id);
}

/** 画像の一辺。これ以上大きくしても、押された跡は小さくしか出ない */
export const STAMP_PIXELS = 128;

/** 送っていい大きさ。128px四方に直したあとなら充分に収まる */
export const STAMP_MAX_BYTES = 200 * 1024;

/** 1人が1日に作れる数。作りすぎで板が埋まるのを防ぐ */
export const STAMP_DAILY_LIMIT = 3;

/** 名前の長さ。探すためのものなので短くてよい */
export const STAMP_NAME_MAX = 20;

/**
 * 何件の通報で自動的に止めるか。
 *
 * 人が見て判断するまで出続けるほうが危ないので、先に止めて後から戻す。
 * 戻すのは管理画面から。既定のスタンプはこの対象にしない。
 */
export const STAMP_REPORTS_TO_HIDE = 3;

/** 受け付ける画像の種類。SVGは中にスクリプトを書けるので受けない */
export const STAMP_ACCEPTED_TYPES = ['image/png', 'image/webp', 'image/jpeg'];

/** 作られたスタンプのID */
export function newStampId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `s_${random}`;
}

/** 止められたスタンプの代わりに出す名前 */
export const DISABLED_STAMP_NAME = '止まっているスタンプ';

/**
 * 持ち物の並び順。
 *
 * よく使うものと、さっき使ったものを上にする。
 * 回数だけで並べると、昔たくさん押したものが上に居座り続ける。
 */
export function paletteOrder(
  a: { use_count: number; last_used_at: number | null; acquired_at: number },
  b: { use_count: number; last_used_at: number | null; acquired_at: number }
): number {
  const score = (s: { use_count: number; last_used_at: number | null; acquired_at: number }) => {
    const last = s.last_used_at ?? s.acquired_at;
    // 1日経つごとに重みが半分になる
    const days = (Date.now() - last) / 86400000;
    return (s.use_count + 1) / Math.pow(2, Math.min(days, 30));
  };
  return score(b) - score(a);
}
