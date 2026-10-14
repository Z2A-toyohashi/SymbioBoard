import Cookies from 'js-cookie';

const USER_ID_KEY = 'ai_space_user_id';
const COOKIE_EXPIRES = 365; // 1年間有効

/**
 * ユーザーIDは Cookie と localStorage の両方に持つ。
 * Cookie だけだと、ブラウザの設定やITP（Safari）で短期間に消えることがあるため、
 * 両方に書いて「どちらか残っていれば同一人物」として扱う。
 *
 * 別ブラウザ・別端末へは引き継ぎコードで移す（lib/handover.ts 側ではなくAPI経由）。
 */
export function getUserId(): string {
  let userId = readStored();

  if (!userId) {
    userId = generateUserId();
  }

  // 片方しか無い場合に備えて毎回両方へ書き戻す
  persist(userId);
  return userId;
}

/** 引き継ぎなどで別のIDに切り替える */
export function setUserId(userId: string): void {
  persist(userId);
}

export function clearUserId(): void {
  Cookies.remove(USER_ID_KEY);
  safeLocalStorage()?.removeItem(USER_ID_KEY);
}

/** 2ちゃんねる風の8桁ID */
function generateUserId(): string {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function readStored(): string | undefined {
  const fromCookie = Cookies.get(USER_ID_KEY);
  const fromLocal = safeLocalStorage()?.getItem(USER_ID_KEY) || undefined;
  return fromCookie || fromLocal;
}

function persist(userId: string): void {
  Cookies.set(USER_ID_KEY, userId, { expires: COOKIE_EXPIRES, sameSite: 'lax' });
  try {
    safeLocalStorage()?.setItem(USER_ID_KEY, userId);
  } catch {
    // プライベートブラウジングなどで書けない場合は Cookie だけで動かす
  }
}

function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}
