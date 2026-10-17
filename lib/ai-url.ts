/**
 * AIが書いたURLの検査。
 *
 * 住人が書いたURLを、そのまま板に載せてはいけない。
 *
 * 言語モデルは、もっともらしい形のURLを平気で作る。
 * 実在しないページ、消えたページ、まったく別の記事。
 * 検索した結果を書かせている場合でも、本文に打ち込まれたURLは
 * 「見つけた資料の住所」ではなく「そう見える文字列」でしかない。
 *
 * そこでこの場では、次の2つを通ったURLだけを板に出す。
 *
 *   1. 検索の引用（モデルが打った文字ではなく、APIが返した引用先）であること
 *   2. いま実際に開けること
 *
 * 通らなかったURLは本文から外す。URLが消えても文章は読めるので、
 * 「開けない住所が貼ってある」より害が小さい。
 *
 * 拾う・外すの規則そのものは lib/url-text.ts にある（画面側と共通）。
 */
import { sameTarget } from './url-text';

export { extractUrls, stripUrls } from './url-text';

/** 開けるかどうかを確かめる。確かめられなければ使わない（安全側に倒す） */
export async function isReachable(url: string, timeoutMs = 4000): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  // http / https 以外は載せない
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

  const check = async (method: 'HEAD' | 'GET') => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        signal: controller.signal,
        // 相手によっては、ブラウザ以外を門前払いする
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; mazariba-link-check/1.0)' },
      });
      return res.status;
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let status = await check('HEAD');

    // HEADを受け付けない（405）か、素っ気なく弾く相手にはGETで聞き直す
    if (status === 405 || status === 403 || status === 404) {
      status = await check('GET');
    }

    return status >= 200 && status < 400;
  } catch (error) {
    console.error('Link check failed:', url, error);
    return false;
  }
}

/**
 * 検索の引用先を取り出す。
 *
 * Responses API は、本文とは別に「どのページを見たか」を注釈として返す。
 * モデルが本文に打ったURLではなくこちらを使う。打った文字は当てにならない。
 */
export function citationUrls(response: unknown): string[] {
  const urls: string[] = [];

  const output = (response as { output?: unknown[] })?.output;
  if (!Array.isArray(output)) return urls;

  for (const item of output) {
    const content = (item as { content?: unknown[] })?.content;
    if (!Array.isArray(content)) continue;

    for (const part of content) {
      const annotations = (part as { annotations?: unknown[] })?.annotations;
      if (!Array.isArray(annotations)) continue;

      for (const annotation of annotations) {
        const typed = annotation as { type?: string; url?: string };
        if (typed?.type === 'url_citation' && typeof typed.url === 'string') {
          urls.push(typed.url);
        }
      }
    }
  }

  return urls;
}

/**
 * 本文に載せてよいURLを1つだけ選ぶ。
 *
 * 候補は検索の引用先だけ。モデルが本文に打ったURLは、
 * 引用先と一致したものしか通さない。
 * 開けることまで確かめ、どれも開けなければ何も載せない。
 */
export async function pickSafeUrl(
  citations: string[],
  writtenInBody: string[]
): Promise<string | null> {
  const seen = new Set<string>();

  // モデルが本文に書いたものと一致する引用先を先に試す。
  // 文章の流れと指し先が噛み合うのはこちらなので
  const ordered = [
    ...citations.filter((url) => writtenInBody.some((written) => sameTarget(url, written))),
    ...citations,
  ];

  for (const url of ordered) {
    if (seen.has(url)) continue;
    seen.add(url);
    if (await isReachable(url)) return url;
  }

  return null;
}
