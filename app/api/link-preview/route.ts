import { NextRequest, NextResponse } from 'next/server';
import { fetchLinkPreview } from '@/lib/link-preview';
import { tidyUrl } from '@/lib/url-text';

/**
 * 貼られたURLの見出しと写真を返す。
 *
 * 画面から直接その住所を読みに行くことはできない（相手の許しが要る）ので、
 * サーバが代わりに見に行く。安全の確認は lib/link-preview.ts 側でしている。
 *
 * 同じURLは板の中で何度も出るし、見る人の数だけ呼ばれる。
 * 中身は滅多に変わらないので、応答をそのまま寝かせてよい。
 * s-maxage で配信側に1日持たせ、裏で入れ替える。
 *
 * 取れなかった場合も 200 で `{ preview: null }` を返す。
 * 画面側はそのとき、ただのリンクとして出すだけで、これは異常ではない。
 */
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const raw = new URL(request.url).searchParams.get('url');
  if (!raw) {
    return NextResponse.json({ error: 'url が要ります' }, { status: 400 });
  }

  const preview = await fetchLinkPreview(tidyUrl(raw));

  return NextResponse.json(
    { preview },
    {
      headers: {
        // 取れたものは長めに、取れなかったものは短めに寝かせる。
        // 相手が一時的に落ちていただけなら、しばらくして直る
        'Cache-Control': preview
          ? 'public, s-maxage=86400, stale-while-revalidate=604800'
          : 'public, s-maxage=600',
      },
    }
  );
}
