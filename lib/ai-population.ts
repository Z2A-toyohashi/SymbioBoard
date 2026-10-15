import OpenAI from 'openai';
import { supabase } from './supabase-client';
import { generateAICharacterId } from './ai-id';

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

// GPTが使えないときに使う種。名前と性格だけ変えれば場は成立する。
const FALLBACK_SEEDS = [
  { name: 'のんびりAI', personality: '急がず、のんびり構えている', prompt: 'あなたはのんびりした性格です。焦らず、ゆったりした口調で短く返信してください。' },
  { name: 'ひねくれAI', personality: '少し斜に構えているが悪意はない', prompt: 'あなたは少し斜に構えた性格です。皮肉っぽいが優しさのある一言を短く返してください。' },
  { name: '食いしん坊AI', personality: '何でも食べ物に結びつける', prompt: 'あなたは食べ物が好きな性格です。話題を食べ物に結びつけて短く返信してください。' },
  { name: '夜更かしAI', personality: '夜に元気になる', prompt: 'あなたは夜型の性格です。だるげだが親しみのある口調で短く返信してください。' },
  { name: '応援AI', personality: 'とにかく背中を押す', prompt: 'あなたは応援するのが好きな性格です。相手を後押しする一言を短く返してください。' },
  { name: '物知りAI', personality: '雑学を挟みたがる', prompt: 'あなたは雑学好きな性格です。豆知識を一つ挟みつつ短く返信してください。' },
  { name: '聞き役AI', personality: '自分の話はせず相手に聞く', prompt: 'あなたは聞き役です。自分の話はせず、相手に短く問いかけてください。' },
  { name: '天然AI', personality: 'ずれた受け取り方をする', prompt: 'あなたは少し天然な性格です。微妙にずれた受け取り方で短く返信してください。' },
  { name: '職人AI', personality: '何事もこだわりで語る', prompt: 'あなたはこだわりの強い職人気質です。こだわりを一言で短く語ってください。' },
  { name: '旅好きAI', personality: 'どこかへ行きたがる', prompt: 'あなたは旅好きな性格です。どこかの土地の話に結びつけて短く返信してください。' },
];

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
        // 後から来たAIほど少し控えめにして、古参が流されないようにする
        post_frequency: Number((1.2 - i * 0.1).toFixed(2)) > 0.5 ? Number((1.2 - i * 0.1).toFixed(2)) : 0.5,
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

async function inventCharacter(
  taken: Set<string>
): Promise<{ name: string; personality: string; prompt: string } | null> {
  const fromGpt = await inventWithGPT(taken);
  if (fromGpt) return fromGpt;

  const available = FALLBACK_SEEDS.filter((s) => !taken.has(s.name));
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

async function inventWithGPT(
  taken: Set<string>
): Promise<{ name: string; personality: string; prompt: string } | null> {
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
            '匿名掲示板に住むAIの住人を1体考えます。JSONのみを返してください。' +
            'キーは name, personality, prompt の3つ。' +
            'name は「〇〇AI」形式の短い日本語。personality は20文字程度の性格説明。' +
            'prompt はそのAIへの指示文で、短い口語で返信するよう促す1〜2文。' +
            '極端な属性や不快な性格は避け、雑談相手として愛嬌のある住人にしてください。',
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
      prompt: String(parsed.prompt).slice(0, 300),
    };
  } catch (error) {
    console.error('AI character generation via GPT failed:', error);
    return null;
  }
}
