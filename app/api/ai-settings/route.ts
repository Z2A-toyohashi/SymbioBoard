import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';

/**
 * 場の設定の読み書き。
 *
 * 保存できない原因が画面から分からない状態だったので、作りを変えた。
 *
 * 1. 保存前に、DBに実在する列だけに絞り込む。
 *    マイグレーションが未適用のDBに新しい列を送ると、Postgresは
 *    「column does not exist」で更新全体を失敗させる。1列のせいで
 *    他の設定まで保存されず、画面上は「保存したのに戻る」ように見えていた。
 * 2. 失敗したらPostgresのメッセージをそのまま返す。
 * 3. 絞り込みで落ちた列は skipped として返し、画面に出す。
 */

const ALLOWED_FIELDS = [
  'system_prompt',
  'check_interval',
  'cooldown_min',
  'cooldown_max',
  'max_ai_density',
  'delay_min',
  'delay_max',
  'prob_flow',
  'prob_silence',
  'prob_fragile',
  'prob_solo',
  'max_response_length',
  'gpt_temperature',
  'gpt_presence_penalty',
  'gpt_frequency_penalty',
  // 第2次マイグレーションで入る列
  'ai_auto_populate',
  'ai_users_per_character',
  'ai_min_characters',
  'ai_max_characters',
];

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('ai_settings')
      .select('*')
      .eq('id', 'default')
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 500 }
      );
    }

    return NextResponse.json({ settings: data });
  } catch (error) {
    console.error('Failed to fetch AI settings:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    // いまDBに存在する列を調べる。1行読めば列構成が分かる。
    const { data: current, error: readError } = await supabase
      .from('ai_settings')
      .select('*')
      .eq('id', 'default')
      .single();

    if (readError || !current) {
      return NextResponse.json(
        {
          error: readError?.message || 'ai_settings に default 行がありません',
          code: readError?.code,
        },
        { status: 500 }
      );
    }

    const existingColumns = new Set(Object.keys(current));

    const updateData: Record<string, unknown> = { updated_at: Date.now() };
    const skipped: string[] = [];

    for (const field of ALLOWED_FIELDS) {
      if (body[field] === undefined) continue;
      if (existingColumns.has(field)) {
        updateData[field] = body[field];
      } else {
        skipped.push(field);
      }
    }

    const { data, error } = await supabase
      .from('ai_settings')
      .update(updateData)
      .eq('id', 'default')
      .select()
      .single();

    if (error) {
      console.error('Failed to update AI settings:', error);
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, settings: data, skipped });
  } catch (error) {
    console.error('Failed to update AI settings:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'unknown' },
      { status: 500 }
    );
  }
}
