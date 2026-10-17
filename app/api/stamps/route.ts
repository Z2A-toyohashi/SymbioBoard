import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';
import {
  STAMP_ACCEPTED_TYPES,
  STAMP_DAILY_LIMIT,
  STAMP_MAX_BYTES,
  STAMP_NAME_MAX,
  isDefaultStamp,
  newStampId,
  type Stamp,
} from '@/lib/stamps';

/**
 * 失敗の理由を、呼んだ側に分かる言葉で返す。
 *
 * ここは画面から直接叩かれる口で、落ちたときに出るのが「500」だけだと、
 * 台帳がまだ無いのか、鍵が足りないのか、画像が大きいのかが分からない。
 * サーバのログは本番では見に行きにくいので、理由は応答にも入れる。
 *
 * 42P01 = テーブルが無い。マイグレーションを流していない場合にこれが出る。
 */
function failed(where: string, error: unknown) {
  const detail = error as { message?: string; code?: string } | null;
  console.error(`Stamp API failed at ${where}:`, error);

  // 42P01 はPostgreSQL、PGRST205 はPostgRESTがテーブルを見つけられない場合。
  // Supabase は後者を「schema cache に無い」という言い方で返す
  const missingTable =
    detail?.code === '42P01' ||
    detail?.code === 'PGRST205' ||
    (detail?.message || '').includes('schema cache');

  if (missingTable) {
    return NextResponse.json(
      {
        error: 'スタンプの台帳がまだありません。migration-011-stamps.sql を実行してください',
        where,
        code: detail?.code,
      },
      { status: 503 }
    );
  }

  return NextResponse.json(
    {
      error: `${where}で失敗しました`,
      details: detail?.message || String(error),
      code: detail?.code,
    },
    { status: 500 }
  );
}

/**
 * 書き手の行を用意する。
 *
 * stamps.created_by と user_stamps.user_id は users を参照している。
 * 画面から来たIDが users に無いと、外部キー違反で作成そのものが落ちる。
 * 作る前に必ず行を用意しておく（AI住人に対する ensureAIUser と同じ考え）。
 */
async function ensureUserRow(userId: string): Promise<void> {
  const { data } = await supabase.from('users').select('id').eq('id', userId).maybeSingle();
  if (data) return;

  const now = Date.now();
  await supabase.from('users').insert([{ id: userId, created_at: now, last_seen: now }]);
}

/**
 * スタンプの台帳。
 *
 * スタンプは板をまたいで共有される「物」で、持ち物は人ごと。
 * ここでは物のほうを扱う（持ち物が増えるのは、押したとき＝/api/reactions）。
 */

/**
 * 一覧。
 *
 * 止めたものも返す。過去のレスに押された跡が残っているので、
 * 画面側で「止まっているスタンプ」として出せるようにするため。
 * userId を渡すと、その人の持ち物も一緒に返す。
 */
export async function GET(request: NextRequest) {
  try {
    const userId = new URL(request.url).searchParams.get('userId');

    const [{ data: stamps, error }, owned] = await Promise.all([
      supabase.from('stamps').select('*').order('created_at', { ascending: false }),
      userId
        ? supabase.from('user_stamps').select('*').eq('user_id', userId)
        : Promise.resolve({ data: [] as unknown[] }),
    ]);

    if (error) return failed('スタンプ一覧の取得', error);

    return NextResponse.json({
      stamps: (stamps || []) as Stamp[],
      owned: (owned.data || []) as Array<{
        stamp_id: string;
        use_count: number;
        last_used_at: number | null;
        acquired_at: number;
      }>,
    });
  } catch (error) {
    return failed('スタンプ一覧の取得', error);
  }
}

/**
 * 作る。
 *
 * 誰でも作れる。作れば板をまたいで全員に広がるので、
 * 入口で絞れるところは絞っておく。
 *
 *   ・受けるのは png / webp / jpeg だけ（SVGは中にスクリプトを書ける）
 *   ・大きさの上限（画面側で128px四方に直してから送る）
 *   ・1人1日3個まで
 *
 * 画面側で canvas に描き直してから送るので、撮影場所などの情報は
 * その時点で落ちている。ここではそれを前提にせず、大きさと種類だけ見る。
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const image = formData.get('image') as File | null;
    const name = String(formData.get('name') || '').trim();
    const userId = String(formData.get('userId') || '').trim();

    if (!image || !userId) {
      return NextResponse.json({ error: '画像と利用者が要ります' }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: '名前を入れてください' }, { status: 400 });
    }
    if (name.length > STAMP_NAME_MAX) {
      return NextResponse.json(
        { error: `名前は${STAMP_NAME_MAX}文字までです` },
        { status: 400 }
      );
    }
    if (!STAMP_ACCEPTED_TYPES.includes(image.type)) {
      return NextResponse.json({ error: 'PNG / WebP / JPEG の画像だけ使えます' }, { status: 400 });
    }
    if (image.size > STAMP_MAX_BYTES) {
      return NextResponse.json({ error: '画像が大きすぎます' }, { status: 400 });
    }

    // 1日に作れる数。日付ではなく24時間で見る（日付だと日またぎで倍作れる）
    const since = Date.now() - 86400000;
    const { count, error: countError } = await supabase
      .from('stamps')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', userId)
      .gte('created_at', since);

    // 台帳が無い場合はここで分かる。先に知らせる
    if (countError) return failed('台帳の確認', countError);

    if ((count || 0) >= STAMP_DAILY_LIMIT) {
      return NextResponse.json(
        { error: `作れるのは24時間に${STAMP_DAILY_LIMIT}個までです` },
        { status: 429 }
      );
    }

    const id = newStampId();
    const ext = image.type === 'image/png' ? 'png' : image.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `stamps/${id}.${ext}`;

    const buffer = new Uint8Array(await image.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(path, buffer, { contentType: image.type, cacheControl: '31536000', upsert: false });

    if (uploadError) return failed('画像の保存', uploadError);

    const {
      data: { publicUrl },
    } = supabase.storage.from('uploads').getPublicUrl(path);

    const now = Date.now();

    // 外部キーの向き先を先に用意する
    await ensureUserRow(userId);

    const { error: insertError } = await supabase.from('stamps').insert([
      {
        id,
        kind: 'image',
        name,
        image_url: publicUrl,
        created_by: userId,
        created_at: now,
      },
    ]);

    if (insertError) {
      // 行が作れなかったなら、置いた画像も残さない
      await supabase.storage.from('uploads').remove([path]);
      return failed('スタンプの登録', insertError);
    }

    // 作った本人は、押す前から持っている
    await supabase
      .from('user_stamps')
      .insert([{ user_id: userId, stamp_id: id, acquired_at: now, use_count: 0 }]);

    return NextResponse.json({
      stamp: { id, kind: 'image', name, image_url: publicUrl, created_by: userId, created_at: now, disabled: false },
    });
  } catch (error) {
    return failed('スタンプの作成', error);
  }
}

/**
 * 止める・戻す（管理画面から）。
 *
 * 消さずに止める。消すと、過去のレスに押された跡まで消えて会話が読めなくなる。
 * 既定のスタンプは止められない。
 */
export async function PATCH(request: NextRequest) {
  try {
    const { stampId, disabled } = await request.json();

    if (!stampId || typeof disabled !== 'boolean') {
      return NextResponse.json({ error: 'stampId と disabled が要ります' }, { status: 400 });
    }
    if (isDefaultStamp(stampId)) {
      return NextResponse.json({ error: '既定のスタンプは止められません' }, { status: 400 });
    }

    const { error } = await supabase.from('stamps').update({ disabled }).eq('id', stampId);
    if (error) return failed('スタンプの更新', error);

    return NextResponse.json({ success: true });
  } catch (error) {
    return failed('スタンプの更新', error);
  }
}
