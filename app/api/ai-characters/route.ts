import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';
import { ensureAIPopulation } from '@/lib/ai-population';
import { generateAICharacterId } from '@/lib/ai-id';

/**
 * AI住人の一覧・追加・更新・削除。
 * 表示側は名前の解決にしか使わないので、GETは軽い項目だけ返す。
 */

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('ai_characters')
      .select('id, name, personality, origin, post_frequency, last_post_time, can_generate_images, can_fetch_news')
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ characters: data || [] });
  } catch (error) {
    console.error('Failed to fetch AI characters:', error);
    return NextResponse.json({ characters: [] }, { status: 500 });
  }
}

/** 管理画面からの手動追加と、人数に合わせた自動増員の両方を受ける */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.mode === 'auto') {
      const { data: settings } = await supabase
        .from('ai_settings')
        .select('*')
        .eq('id', 'default')
        .single();

      const { data: users } = await supabase
        .from('users')
        .select('id')
        .gte('last_seen', Date.now() - 3600000);

      const result = await ensureAIPopulation(
        { ...settings, ai_auto_populate: true },
        body.userCount ?? users?.length ?? 1
      );

      return NextResponse.json(result);
    }

    const { name, personality, system_prompt } = body;
    if (!name || !personality || !system_prompt) {
      return NextResponse.json({ error: '名前・性格・プロンプトは必須です' }, { status: 400 });
    }

    // 自動生成の住人と同じく4桁の数字。板では末尾4桁しか出ない
    const id = await generateAICharacterId();
    if (!id) {
      return NextResponse.json({ error: '空いているIDがありません' }, { status: 409 });
    }

    const { data, error } = await supabase
      .from('ai_characters')
      .insert([
        {
          id,
          name: String(name).slice(0, 20),
          personality: String(personality).slice(0, 100),
          system_prompt: String(system_prompt).slice(0, 1000),
          created_at: Date.now(),
          last_post_time: 0,
          post_frequency: body.post_frequency ?? 1.0,
          can_generate_images: body.can_generate_images ?? false,
          image_generation_probability: 0.05,
          can_fetch_news: body.can_fetch_news ?? false,
          news_fetch_probability: 0.1,
          origin: 'manual',
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ character: data });
  } catch (error) {
    console.error('Failed to create AI character:', error);
    return NextResponse.json({ error: '追加できませんでした' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { id, ...updates } = await request.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const allowed = ['name', 'personality', 'system_prompt', 'post_frequency', 'can_generate_images', 'can_fetch_news'];
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in updates) patch[key] = updates[key];
    }

    const { error } = await supabase.from('ai_characters').update(patch).eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update AI character:', error);
    return NextResponse.json({ error: '更新できませんでした' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const { error } = await supabase.from('ai_characters').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete AI character:', error);
    return NextResponse.json({ error: '削除できませんでした' }, { status: 500 });
  }
}
