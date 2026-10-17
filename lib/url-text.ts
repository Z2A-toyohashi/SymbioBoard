/**
 * 本文の中のURLの扱い。
 *
 * 拾う・外す、の2つだけ。画面側（本文のリンク化、サムネイル）と
 * サーバ側（AIが書いたURLの検査）の両方から読むので、何にも依存させない。
 *
 * 切り出しの境目がこの場の肝で、同じ規則をあちこちに書くと必ずずれる。
 * URLに関わる正規表現はこのファイルにしか置かない。
 */

/**
 * 本文から拾うURL。
 *
 * 日本語の文中に裸で書かれるので、どこで切るかが要になる。
 * 止めるのは、空白と、URLには普通そのまま入らない記号（句読点・鉤括弧など）。
 *
 * 日本語そのものは止める文字に入れていない。
 * https://ja.wikipedia.org/wiki/日本語 のように、日本語を含むURLは実在する。
 */
export const URL_PATTERN =
  /https?:\/\/[^\s<>"'`、。，．・…：；！？「」『』（）〔〕【】〈〉《》｡｢｣､()[\]{}|\\^]+/g;

/**
 * 末尾の記号はURLに含めない。
 * 「詳しくは https://example.com/abc.」の「.」まで拾うと、開けないリンクになる。
 */
export const TRAILING_PUNCTUATION = /[!?.,:;]+$/;

/** 末尾の記号を落としたURL。拾えなければ空文字 */
export function tidyUrl(raw: string): string {
  const trailing = raw.match(TRAILING_PUNCTUATION)?.[0] ?? '';
  return trailing ? raw.slice(0, -trailing.length) : raw;
}

export function extractUrls(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = tidyUrl(match[0]);
    if (url) found.push(url);
  }
  return found;
}

/**
 * 本文からURLを外す。
 *
 * 外した跡の空白をそのままにすると「昨日のあれ、 で見た」のように、
 * 日本語の途中に穴が空いたまま残る。跡も一緒に畳む。
 */
export function stripUrls(text: string): string {
  return text
    .replace(URL_PATTERN, '')
    // 日本語の字に挟まれた空白は、URLを抜いた跡なので詰める
    .replace(/(?<=[^\x00-\x7F])[ \t]+(?=[^\x00-\x7F])/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

/** 同じページを指しているか。末尾の / と追跡用の問い合わせは無視する */
export function sameTarget(a: string, b: string): boolean {
  const normalize = (value: string) => {
    try {
      const url = new URL(value);
      url.hash = '';
      for (const key of [...url.searchParams.keys()]) {
        if (key.startsWith('utm_') || key === 'ref' || key === 'fbclid') {
          url.searchParams.delete(key);
        }
      }
      return `${url.host}${url.pathname.replace(/\/$/, '')}${url.search}`;
    } catch {
      return value;
    }
  };

  return normalize(a) === normalize(b);
}
