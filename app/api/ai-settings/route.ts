import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('ai_settings')
      .select('*')
      .eq('id', 'default')
      .single();

    if (error) throw error;

    return NextResponse.json({ settings: data });
  } catch (error) {
    console.error('Failed to fetch AI settings:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    const updateData: any = {
      updated_at: Date.now(),
    };

    // 許可されたフィールドのみ更新
    const allowedFields = [
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
      // AI人口の自動調整
      'ai_auto_populate',
      'ai_users_per_character',
      'ai_min_characters',
      'ai_max_characters',
    ];

    allowedFields.forEach(field => {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    });

    const { data, error } = await supabase
      .from('ai_settings')
      .update(updateData)
      .eq('id', 'default')
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, settings: data });
  } catch (error) {
    console.error('Failed to update AI settings:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
