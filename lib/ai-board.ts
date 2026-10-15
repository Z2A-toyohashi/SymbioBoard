import OpenAI from 'openai';
import type { Post } from '@/types';
import { supabase } from './supabase-client';
import { buildResidentPrompt } from './prompt';
import { generateAIResponseWithGPT } from './gpt';
import type { AIConfig } from './ai-speak';

/**
 * AIが板を立てる。
 *
 * 書き込みと違って、板は消えない。誰も来ない板が並ぶと一覧が墓場になり、
 * 新しく来た人がどこに書けばいいか分からなくなる。だから書き込みより
 * ずっと厳しく絞る。
 *
 * 立てる条件（すべて満たしたときだけ）:
 *   1. 1日の板の数の上限に達していない（既定1枚/日）
 *   2. 板の総数が上限未満（既定12）
 *   3. 書き込みが1件もない板が存在しない
 *      ＝ いま空いている部屋があるなら、新しい部屋は作らない
 *   4. 直近24時間に人の書き込みがある
 *      ＝ 誰も来ていない場所で勝手に増やさない
 *   5. 確率（既定5%）に当たった
 *
 * 立てたら必ず最初の一行を置く。空の板だけ残ると、壊れているように見える。
 */

export interface BoardCreation {
  boardId: string;
  title: string;
  description: string;
  aiId: string;
}

export async function maybeCreateBoard(config: AIConfig): Promise<BoardCreation | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  if (Math.random() >= config.ai_board_creation_probability) return null;

  const now = Date.now();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  // 1. 今日もう立てたか
  const { count: todayCount } = await supabase
    .from('logs')
    .select('id', { count: 'exact', head: true })
    .eq('event_type', 'ai_board')
    .gte('created_at', startOfDay.getTime());

  if ((todayCount || 0) >= config.ai_board_creation_daily_budget) return null;

  // 2. 板の総数
  const { data: boards } = await supabase
    .from('boards')
    .select('id, title, description')
    .eq('archived', false);

  if (!boards || boards.length >= config.ai_max_boards) return null;

  // 3. 空いている板があるなら、そこに書けばよい
  const { data: posts } = await supabase
    .from('posts')
    .select('board_id, author_type, created_at')
    .gte('created_at', now - 86400000);

  const boardsWithAnyPost = new Set<string>();
  const { data: allBoardIds } = await supabase.from('posts').select('board_id');
  for (const p of allBoardIds || []) {
    if (p.board_id) boardsWithAnyPost.add(p.board_id as string);
  }
  if (boards.some((b) => !boardsWithAnyPost.has(b.id as string))) return null;

  // 4. 人がいるか
  const humanPosts = (posts || []).filter((p) => p.author_type === 'user');
  if (humanPosts.length === 0) return null;

  // 住人を1人選ぶ
  const { data: characters } = await supabase
    .from('ai_characters')
    .select('id, name, system_prompt');
  if (!characters || characters.length === 0) return null;
  const character = characters[Math.floor(Math.random() * characters.length)];

  // 何の板を立てるかを考える
  const idea = await inventBoard(
    config,
    boards.map((b) => `${b.title}${b.description ? `（${b.description}）` : ''}`),
    character.system_prompt as string
  );
  if (!idea) return null;

  const boardId = `b${now.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

  const { error } = await supabase.from('boards').insert([
    {
      id: boardId,
      title: idea.title,
      description: idea.description,
      created_at: now,
      created_by: character.id,
      is_default: false,
      archived: false,
    },
  ]);

  if (error) {
    console.error('AI board creation failed:', error.message);
    return null;
  }

  await supabase.from('logs').insert([
    {
      event_type: 'ai_board',
      user_id: character.id as string,
      post_id: null,
      metadata: { board_id: boardId, title: idea.title, description: idea.description },
      created_at: now,
    },
  ]);

  // 立てたら最初の一行を置く。空の板だけ残すと壊れて見える
  await writeOpeningPost(boardId, idea, character, config);

  return {
    boardId,
    title: idea.title,
    description: idea.description,
    aiId: character.id as string,
  };
}

/** 板の名前と趣旨を考える */
async function inventBoard(
  config: AIConfig,
  existing: string[],
  characterPrompt: string
): Promise<{ title: string; description: string } | null> {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await openai.chat.completions.create({
      model: config.gpt_model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            `${characterPrompt}\n\n` +
            `あなたは匿名掲示板の住人です。自分がAIであることは決して書きません。\n` +
            `新しい板（テーマごとの部屋）を1つ立てます。JSONだけを返してください。\n` +
            `キーは title と description の2つ。\n` +
            `・title は15文字以内。「〇〇板」のような固い名前にせず、短い言葉で。\n` +
            `・description は60文字以内。そこで何を話すのかを一行で。\n` +
            `・既にある板と似た話題は避けてください。\n` +
            `・誰でも書けるくらい間口の広い話題にしてください。` +
            `特定の人しか書けない専門的すぎる話題は避けます。`,
        },
        {
          role: 'user',
          content: `既にある板:\n${existing.map((e) => `- ${e}`).join('\n') || '（なし）'}`,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { title?: string; description?: string };
    const title = String(parsed.title || '').trim().slice(0, 40);
    const description = String(parsed.description || '').trim().slice(0, 120);
    if (!title || !description) return null;

    return { title, description };
  } catch (error) {
    console.error('Board idea generation failed:', error);
    return null;
  }
}

/** 立てた本人が最初の一行を置く */
async function writeOpeningPost(
  boardId: string,
  board: { title: string; description: string },
  character: { id: unknown; system_prompt: unknown },
  config: AIConfig
): Promise<void> {
  const systemPrompt = buildResidentPrompt({
    commonPrompt: config.system_prompt,
    characterPrompt: character.system_prompt as string,
    board,
    posts: [],
    state: 'SILENCE',
    isReply: false,
  });

  const content = await generateAIResponseWithGPT(
    `${systemPrompt}\n\nこの板はいま、あなたが立てたばかりです。最初の一行を置いてください。` +
      `説明や挨拶ではなく、あなた自身の話から始めます。`,
    [],
    undefined,
    config.max_response_length,
    config.gpt_temperature,
    config.gpt_presence_penalty,
    config.gpt_frequency_penalty,
    config.gpt_model
  );

  if (!content) return;

  const now = Date.now();
  const aiId = character.id as string;

  // 投稿者として users に行が要る
  const { data: existing } = await supabase.from('users').select('id').eq('id', aiId).single();
  if (!existing) {
    await supabase.from('users').insert([{ id: aiId, created_at: now, last_seen: now }]);
  }

  const post: Post = {
    id: `ai-${now}-${Math.random().toString(36).slice(2, 8)}`,
    content,
    type: 'text',
    created_at: now,
    thread_id: null,
    author_type: 'ai',
    author_id: aiId,
    media_url: null,
    board_id: boardId,
  };

  const { error } = await supabase.from('posts').insert([post]);
  if (error) {
    console.error('Opening post failed:', error.message);
    return;
  }

  await supabase.from('logs').insert([
    {
      event_type: 'ai_intervention',
      user_id: aiId,
      post_id: post.id,
      metadata: { state: 'SILENCE', content, board_id: boardId, is_opening: true },
      created_at: now,
    },
  ]);
}
