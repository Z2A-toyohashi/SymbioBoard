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

    if (error) throw error;

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
    console.error('Failed to list stamps:', error);
    return NextResponse.json({ error: 'Failed to list stamps' }, { status: 500 });
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
    const { count } = await supabase
      .from('stamps')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', userId)
      .gte('created_at', since);

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

    if (uploadError) {
      console.error('Stamp upload failed:', uploadError);
      return NextResponse.json({ error: '画像を置けませんでした' }, { status: 500 });
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('uploads').getPublicUrl(path);

    const now = Date.now();
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

    if (insertError) throw insertError;

    // 作った本人は、押す前から持っている
    await supabase
      .from('user_stamps')
      .insert([{ user_id: userId, stamp_id: id, acquired_at: now, use_count: 0 }]);

    return NextResponse.json({
      stamp: { id, kind: 'image', name, image_url: publicUrl, created_by: userId, created_at: now, disabled: false },
    });
  } catch (error) {
    console.error('Failed to create stamp:', error);
    return NextResponse.json({ error: '作れませんでした' }, { status: 500 });
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
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update stamp:', error);
    return NextResponse.json({ error: 'Failed to update stamp' }, { status: 500 });
  }
}
