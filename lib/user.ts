import Cookies from 'js-cookie';

const USER_ID_KEY = 'ai_space_user_id';
const COOKIE_EXPIRES = 365; // 1年間有効

/**
 * ユーザーIDは Cookie と localStorage の両方に持つ。
 * Cookie だけだと、ブラウザの設定やITP（Safari）で短期間に消えることがあるため、
 * 両方に書いて「どちらか残っていれば同一人物」として扱う。
 *
 * 別ブラウザ・別端末へは引き継ぎコードで移す（lib/handover.ts 側ではなくAPI経由）。
 *
 * 新しいIDはサーバから受け取る。IDは4桁の数字で、AIと同じ形にしてある
 * （理由は lib/short-id.ts）。4桁は9000通りしかないので、画面側で作ると
 * 他の人と被る。被れば別人が同じ人として扱われるため、発行はサーバだけが行う。
 */

/** すでに持っているIDを読む。まだ無ければ undefined */
export function readUserId(): string | undefined {
  return readStored();
}

/**
 * IDを用意する。持っていなければサーバに発行してもらう。
 * 画面はこれを待ってから自分のIDを使う。
 */
export async function ensureUserId(): Promise<string> {
  const stored = readStored();

  if (stored) {
    // 片方しか無い場合に備えて毎回両方へ書き戻す
    persist(stored);
    return stored;
  }

  const issued = await issueUserId();
  if (issued) {
    persist(issued);
    return issued;
  }

  /**
   * 発行できなかったとき（通信が切れている、Supabaseが落ちている等）。
   *
   * 4桁を手元で作ると他の人と被りうる。被ると別人の書き込みが自分のものとして
   * 扱われてしまうので、見た目を揃えることより取り違えないことを優先し、
   * 従来どおり被らない8桁で逃げる。画面には4桁に写して出す（displayId）。
   */
  const fallback = generateLocalId();
  persist(fallback);
  return fallback;
}

/** 引き継ぎなどで別のIDに切り替える */
export function setUserId(userId: string): void {
  persist(userId);
}

export function clearUserId(): void {
  Cookies.remove(USER_ID_KEY);
  safeLocalStorage()?.removeItem(USER_ID_KEY);
}

async function issueUserId(): Promise<string | undefined> {
  try {
    const res = await fetch('/api/users/issue', { method: 'POST' });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { userId?: string };
    return data.userId;
  } catch {
    return undefined;
  }
}

/** サーバに繋がらないときだけ使う、被らない8桁 */
function generateLocalId(): string {
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
