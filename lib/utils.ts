import { USER_COLORS } from '@/types';

// ユーザーIDから色を取得
export function getUserColor(userId: string): string {
  const hash = userId.split('').reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

// ランダムな遅延
export function randomDelay(min: number, max: number): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, delay * 1000));
}

// 時間のフォーマット
export function formatTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'たった今';
  if (minutes < 60) return `${minutes}分前`;
  if (hours < 24) return `${hours}時間前`;
  return `${days}日前`;
}

/**
 * 共存度。
 *
 * その場の書き込みが人とAIでどれだけ釣り合っているかを 0〜100 で表す。
 * 半々なら 100、どちらか一方しかいなければ 0。
 *
 *   共存度 = 2 × min(人, AI) ÷ 全体
 *
 * 「AIが何割か」ではなく「混ざっているか」を見たいので、
 * 人だけの板とAIだけの板が同じ 0 になるこの式にしている。
 * なお、どの書き込みがAIかは画面に出さない。出すのは全体の比率だけ。
 */
export function coexistenceRate(humanCount: number, aiCount: number): number {
  const total = humanCount + aiCount;
  if (total === 0) return 0;
  return Math.round((2 * Math.min(humanCount, aiCount) * 100) / total);
}

/** 板の開設日など、相対表記では意味が薄いものに使う絶対日付 */
export function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(
    d.getDate()
  ).padStart(2, '0')}`;
}
