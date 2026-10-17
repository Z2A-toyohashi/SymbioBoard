import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';
import { STAMP_REPORTS_TO_HIDE, isDefaultStamp } from '@/lib/stamps';

/**
 * スタンプの通報。
 *
 * 誰でも画像を足せるので、見た人が止められる口を必ず用意しておく。
 * 人が見て判断するまで出続けるほうが危ないので、一定数で先に自動で止める。
 * 止めるだけで消しはしない。戻すのは管理画面から。
 *
 * 同じ人が何度押しても1件。UNIQUE(stamp_id, user_id) で弾かれる。
 */
export async function POST(request: NextRequest) {
  try {
    const { stampId, userId, reason } = await request.json();

    if (!stampId || !userId) {
      return NextResponse.json({ error: 'stampId と userId が要ります' }, { status: 400 });
    }
    if (isDefaultStamp(stampId)) {
      return NextResponse.json({ error: '既定のスタンプは通報できません' }, { status: 400 });
    }

    const { error } = await supabase.from('stamp_reports').insert([
      {
        stamp_id: stampId,
        user_id: userId,
        reason: typeof reason === 'string' ? reason.slice(0, 200) : null,
        created_at: Date.now(),
      },
    ]);

    // 既に通報済み。二重に数えないだけで、本人には同じ返事を返す
    const alreadyReported = Boolean(error && error.message.includes('duplicate'));
    if (error && !alreadyReported) throw error;

    const { count } = await supabase
      .from('stamp_reports')
      .select('id', { count: 'exact', head: true })
      .eq('stamp_id', stampId);

    const reportCount = count || 0;
    const shouldHide = reportCount >= STAMP_REPORTS_TO_HIDE;

    await supabase
      .from('stamps')
      .update({ report_count: reportCount, ...(shouldHide ? { disabled: true } : {}) })
      .eq('id', stampId);

    return NextResponse.json({ success: true, reportCount, hidden: shouldHide });
  } catch (error) {
    console.error('Failed to report stamp:', error);
    return NextResponse.json({ error: '通報できませんでした' }, { status: 500 });
  }
}
