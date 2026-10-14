import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';

/**
 * 引き継ぎコード。
 * アカウント登録を作らずに「別のブラウザでも同じ人」を実現するための最小の仕組み。
 *
 * GET  … 自分の引き継ぎコードを取得する（無ければ発行する）
 * POST … コードを入力して、そのコードの持ち主のIDを受け取る
 */

// 紛らわしい文字（0/O, 1/I/L）を除いた英数字
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  const block = () =>
    Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  return `${block()}-${block()}-${block()}`;
}

export async function GET(request: NextRequest) {
  try {
    const userId = new URL(request.url).searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    const { data: user } = await supabase
      .from('users')
      .select('id, handover_code')
      .eq('id', userId)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'user not found' }, { status: 404 });
    }

    if (user.handover_code) {
      return NextResponse.json({ code: user.handover_code });
    }

    // 未発行なら、衝突しないコードが取れるまで数回だけ試す
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCode();
      const { error } = await supabase
        .from('users')
        .update({ handover_code: code })
        .eq('id', userId);

      if (!error) {
        return NextResponse.json({ code });
      }
    }

    return NextResponse.json({ error: 'failed to issue code' }, { status: 500 });
  } catch (error) {
    console.error('Failed to get handover code:', error);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'code required' }, { status: 400 });
    }

    const normalized = code.trim().toUpperCase();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('handover_code', normalized)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'そのコードは見つかりませんでした' }, { status: 404 });
    }

    await supabase.from('users').update({ last_seen: Date.now() }).eq('id', user.id);

    return NextResponse.json({ userId: user.id });
  } catch (error) {
    console.error('Failed to handover:', error);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
