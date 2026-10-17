import { lookup } from 'dns/promises';

/**
 * 貼られたURLの中身を見に行って、見出しと写真を拾う。
 *
 * ここはこのアプリで唯一「誰かが書いた住所へ、サーバが自分で出かけていく」場所。
 * 書き込みは誰でもできるので、出かけ先を選ばせると社内向けの住所を踏ませられる。
 * （クラウドの管理情報が返る 169.254.169.254 のような相手が典型）
 *
 * なので次を守る。
 *
 *   1. http / https だけ
 *   2. 名前を引いて、行き先が外の住所であることを確かめてから出かける
 *   3. 転送（リダイレクト）は自動で追わない。1回ごとに2を確かめ直す
 *   4. 時間と大きさに上限を置く。全部読まない
 *
 * 取れなければ null を返す。画面側はそのとき、ただのリンクとして出す。
 */

export interface LinkPreview {
  url: string;
  host: string;
  title: string;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

/** 相手を待つ時間 */
const TIMEOUT_MS = 5000;
/** 読む大きさ。見出しは先頭に入っているので、全部は要らない */
const MAX_BYTES = 256 * 1024;
/** 追う転送の回数 */
const MAX_REDIRECTS = 3;

const USER_AGENT = 'Mozilla/5.0 (compatible; mazariba-link-preview/1.0; +https://symbio-board.vercel.app)';

export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreview | null> {
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let response: Response | null = null;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!(await isPublicTarget(current))) return null;

      const res = await fetch(current.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'ja,en;q=0.8',
        },
      });

      // 転送は自分で追う。追う先も毎回確かめる
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) return null;
        current = new URL(location, current);
        continue;
      }

      if (!res.ok) return null;

      const type = res.headers.get('content-type') || '';
      if (!type.includes('html')) return null;

      response = res;
      break;
    }

    if (!response) return null;

    const html = await readCapped(response, MAX_BYTES);
    if (!html) return null;

    return buildPreview(html, current);
  } catch (error) {
    console.error('Link preview failed:', rawUrl, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 行き先が外の住所か。名前を引いて、返ってきた全部を見る */
async function isPublicTarget(url: URL): Promise<boolean> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

  try {
    const addresses = await lookup(url.hostname, { all: true });
    if (addresses.length === 0) return false;
    return addresses.every(({ address, family }) => !isPrivateAddress(address, family));
  } catch {
    return false;
  }
}

/**
 * 内側の住所か。
 * 自分自身・社内網・クラウドの管理用など、外から来た人に見せないもの。
 */
function isPrivateAddress(address: string, family: number): boolean {
  if (family === 6) {
    const lower = address.toLowerCase();

    // ::ffff:192.168.0.1 のように、v4の住所をv6の形で書いたもの
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1], 4);

    if (lower === '::' || lower === '::1') return true;
    // fc00::/7（内側用）と fe80::/10（同じ線の中だけ）
    if (/^f[cd]/.test(lower)) return true;
    if (/^fe[89ab]/.test(lower)) return true;
    return false;
  }

  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;

  if (a === 0 || a === 127) return true; // 自分自身
  if (a === 10) return true; // 社内網
  if (a === 172 && b >= 16 && b <= 31) return true; // 社内網
  if (a === 192 && b === 168) return true; // 社内網
  if (a === 169 && b === 254) return true; // クラウドの管理用
  if (a === 100 && b >= 64 && b <= 127) return true; // 事業者の内側
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true; // 同報・予約

  return false;
}

/** 先頭から決めた量だけ読む。長いページを全部もらわない */
async function readCapped(response: Response, maxBytes: number): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    total += value.length;
  }

  await reader.cancel().catch(() => {});

  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }

  return new TextDecoder('utf-8').decode(buffer);
}

/** 見出し・説明・写真を拾う。OGPが無ければ <title> で代える */
function buildPreview(html: string, url: URL): LinkPreview | null {
  const meta = readMetaTags(html);

  const title =
    meta['og:title'] ||
    meta['twitter:title'] ||
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ||
    '';

  const cleanTitle = decodeEntities(title).replace(/\s+/g, ' ').trim();
  // 見出しが無いものは、カードにしても何も伝わらない
  if (!cleanTitle) return null;

  const rawImage = meta['og:image'] || meta['twitter:image'] || meta['og:image:url'] || '';
  let image: string | null = null;
  if (rawImage) {
    try {
      const resolved = new URL(decodeEntities(rawImage), url);
      if (resolved.protocol === 'http:' || resolved.protocol === 'https:') {
        image = resolved.toString();
      }
    } catch {
      image = null;
    }
  }

  const description = decodeEntities(
    meta['og:description'] || meta['twitter:description'] || meta.description || ''
  )
    .replace(/\s+/g, ' ')
    .trim();

  return {
    url: url.toString(),
    host: url.host.replace(/^www\./, ''),
    title: cleanTitle.slice(0, 120),
    description: description ? description.slice(0, 160) : null,
    image,
    siteName: decodeEntities(meta['og:site_name'] || '').trim() || null,
  };
}

/** meta タグを名前→中身の形で集める。属性の順番は決め打ちにしない */
function readMetaTags(html: string): Record<string, string> {
  const found: Record<string, string> = {};

  for (const tag of html.match(/<meta\s[^>]*>/gi) || []) {
    const key =
      tag.match(/\sproperty\s*=\s*["']([^"']+)["']/i)?.[1] ||
      tag.match(/\sname\s*=\s*["']([^"']+)["']/i)?.[1];
    const value = tag.match(/\scontent\s*=\s*["']([^"']*)["']/i)?.[1];

    if (key && value && !found[key.toLowerCase()]) {
      found[key.toLowerCase()] = value;
    }
  }

  return found;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}
