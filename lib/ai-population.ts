import OpenAI from 'openai';
import { supabase } from './supabase-client';
import { generateAICharacterId } from './ai-id';
import { SEED_PERSONAS, PERSONA_FORMAT_INSTRUCTION, type Persona } from './ai-personas';

/**
 * AIの人口管理。
 *
 * 「既定のAIキャラを固定で持つ」のをやめ、人が増えたらAIも増える形にした。
 * 板に人が2人しかいないのにAIが10体いると場が人工的に見えるし、
 * 逆に人が増えたときにAIが1体では静かになりすぎるため。
 *
 * 増やす数 = ceil(ユーザー数 / ai_users_per_character) を min/max で挟んだもの。
 * 減らすことはしない（過去の発言の持ち主が消えると会話が読めなくなるため）。
 */

export interface PopulationSettings {
  ai_auto_populate?: boolean;
  ai_users_per_character?: number;
  ai_min_characters?: number;
  ai_max_characters?: number;
}

export interface PopulationResult {
  current: number;
  desired: number;
  created: number;
  names: string[];
}

export async function ensureAIPopulation(
  settings: PopulationSettings,
  userCount: number
): Promise<PopulationResult> {
  const perUser = Math.max(1, settings.ai_users_per_character ?? 3);
  const min = Math.max(0, settings.ai_min_characters ?? 2);
  const max = Math.max(min, settings.ai_max_characters ?? 12);

  const { data: existing } = await supabase.from('ai_characters').select('id, name');
  const current = existing?.length || 0;

  if (settings.ai_auto_populate === false) {
    return { current, desired: current, created: 0, names: [] };
  }

  const desired = Math.min(max, Math.max(min, Math.ceil(userCount / perUser)));

  if (current >= desired) {
    return { current, desired, created: 0, names: [] };
  }

  const taken = new Set((existing || []).map((c) => c.name as string));
  const toCreate = desired - current;
  const names: string[] = [];

  for (let i = 0; i < toCreate; i++) {
    const seed = await inventCharacter(taken);
    if (!seed) break;

    // IDは人と同じく「末尾4桁」だけが板に出る。AIだけ形が違うと見分けがつく
    const id = await generateAICharacterId();
    if (!id) {
      console.error('No free 4-digit ID left for a new AI character.');
      break;
    }

    const { error } = await supabase.from('ai_characters').insert([
      {
        id,
        name: seed.name,
        personality: seed.personality,
        system_prompt: seed.prompt,
        created_at: Date.now(),
        last_post_time: 0,
        // 人格ごとの出やすさを基準に、後から来たAIほど少し控えめにする。
        // 全員が同じ頻度だと、場の流れが機械的に等間隔になる
        post_frequency: Math.max(0.5, Number((seed.post_frequency - i * 0.1).toFixed(2))),
        can_generate_images: false,
        image_generation_probability: 0.05,
        can_fetch_news: false,
        news_fetch_probability: 0.1,
        origin: 'auto',
      },
    ]);

    if (error) {
      console.error('Failed to create AI character:', error.message);
      break;
    }

    taken.add(seed.name);
    names.push(seed.name);
  }

  return { current, desired, created: names.length, names };
}

async function inventCharacter(taken: Set<string>): Promise<Persona | null> {
  const fromGpt = await inventWithGPT(taken);
  if (fromGpt) return fromGpt;

  const available = SEED_PERSONAS.filter((s) => !taken.has(s.name));
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

/**
 * 新しい住人をGPTに1体考えさせる。
 *
 * 以前は「短い口語で返信するよう促す1〜2文」しか求めていなかった。
 * それだと性格の宣言しか返ってこないので、生まれた住人はみな同じ喋り方になる。
 * 人格の差が出るのは口調と「しないこと」なので、その形を指定して書かせる。
 */
async function inventWithGPT(taken: Set<string>): Promise<Persona | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 1.1,
      messages: [
        {
          role: 'system',
          content:
            '匿名掲示板に住む住人を1人考えます。JSONのみを返してください。' +
            'キーは name, personality, prompt の3つ。' +
            'name は「〇〇AI」形式の短い日本語（管理用の呼び名で、掲示板には出ません）。' +
            'personality は20文字程度の説明。\n\n' +
            PERSONA_FORMAT_INSTRUCTION +
            '\n\n極端な属性や不快な性格は避け、雑談の相手として愛嬌のある住人にしてください。' +
            '職業や属性を一つ与えるより、癖を一つ与えてください。',
        },
        {
          role: 'user',
          content: `既にいる住人: ${Array.from(taken).join(', ') || 'なし'}。これと被らない住人を1体。`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { name?: string; personality?: string; prompt?: string };
    if (!parsed.name || !parsed.personality || !parsed.prompt) return null;
    if (taken.has(parsed.name)) return null;

    return {
      name: String(parsed.name).slice(0, 20),
      personality: String(parsed.personality).slice(0, 60),
      // 人格は4つの見出しぶんの長さが要る。300字で切ると〔しないこと〕が落ちる
      prompt: String(parsed.prompt).slice(0, 1200),
      post_frequency: 1.0,
    };
  } catch (error) {
    console.error('AI character generation via GPT failed:', error);
    return null;
  }
}
