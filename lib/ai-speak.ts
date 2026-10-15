import type { Post } from '@/types';
import { supabase } from './supabase-client';
import { detectSpaceState } from './ai-logic';
import { generateAIResponseWithGPT } from './gpt';
import { buildResidentPrompt } from './prompt';
import { ensureAIPopulation } from './ai-population';
import { shouldAIReact, selectRandomEmoji } from './ai-manager';

/**
 * 板ごとの自立発言。
 *
 * これまでAIが喋るかどうかは、画面を開いている人のブラウザが30秒ごとに
 * 判定していた。そのため「誰も開いていない板は永久に止まったまま」で、
 * 逆に同じ板を3人が開いていれば判定も生成も3重に走っていた。
 * 板ごとに自立させるなら、判定と生成はサーバ側に一本化するしかない。
 *
 * 費用は回数でしか決まらないので、生成に辿り着くまでに無料の関門を並べる。
 * 上から順に、1つでも引っかかればGPTを呼ばずに終わる。
 *
 *   1. 1日の生成上限（全板合計）。板を増やしても費用の天井は動かない
 *   2. 板ごとの点検間隔。動いている板は短く、止まっている板は長く
 *   3. 同時実行の排除（lease）。何人が開いていても1回しか走らない
 *   4. AI密度と確率の判定。ここまでは全部DBとMath.randomだけで済む
 *
 * GPTを呼ぶのは、この4つを抜けたときだけ。
 */

export interface AIConfig {
  cooldown_min: number;
  cooldown_max: number;
  max_ai_density: number;
  prob_flow: number;
  prob_silence: number;
  prob_fragile: number;
  prob_solo: number;
  system_prompt: string;
  max_response_length: number;
  gpt_temperature: number;
  gpt_presence_penalty: number;
  gpt_frequency_penalty: number;
  ai_daily_budget: number;
  ai_board_interval_active: number;
  ai_board_interval_quiet: number;
  ai_board_active_window: number;
  ai_background_boards: number;
  [key: string]: unknown;
}

const DEFAULTS: AIConfig = {
  cooldown_min: 300000,
  cooldown_max: 900000,
  max_ai_density: 0.2,
  prob_flow: 0.0,
  prob_silence: 0.35,
  prob_fragile: 0.15,
  prob_solo: 0.5,
  system_prompt: 'あなたは自然な会話口調で短く返信してください。',
  max_response_length: 60,
  gpt_temperature: 1.0,
  gpt_presence_penalty: 0.6,
  gpt_frequency_penalty: 0.6,
  ai_daily_budget: 150,
  ai_board_interval_active: 600000,
  ai_board_interval_quiet: 10800000,
  ai_board_active_window: 1800000,
  ai_background_boards: 1,
};

export interface SpeakOutcome {
  boardId: string;
  posted: boolean;
  reason: string;
  content?: string;
  aiId?: string;
  state?: string;
}

interface AICharacterRow {
  id: string;
  name: string;
  system_prompt: string;
  post_frequency?: number;
  can_fetch_news?: boolean;
  news_fetch_probability?: number;
  can_generate_images?: boolean;
  image_generation_probability?: number;
}

/** 設定。マイグレーション未適用の列は既定値で埋める */
export async function loadAIConfig(): Promise<AIConfig> {
  const { data } = await supabase.from('ai_settings').select('*').eq('id', 'default').single();
  const config = { ...DEFAULTS } as AIConfig;
  if (data) {
    for (const [key, value] of Object.entries(data)) {
      if (value !== null && value !== undefined) config[key] = value;
    }
  }
  return config;
}

/**
 * 今日あと何回生成してよいか。
 *
 * 板ごとに上限を持たせると、板が増えたぶんだけ費用が増える。
 * 上限は全体で1つだけ持ち、板はその枠を取り合う形にする。
 */
export async function remainingBudget(config: AIConfig): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from('logs')
    .select('id', { count: 'exact', head: true })
    .eq('event_type', 'ai_intervention')
    .gte('created_at', startOfDay.getTime());

  return Math.max(0, config.ai_daily_budget - (count || 0));
}

/** 点検の順番が来ている板を、古い順に拾う */
export async function pickDueBoards(limit: number, exclude: string[] = []): Promise<string[]> {
  if (limit <= 0) return [];
  const now = Date.now();

  const { data: boards } = await supabase.from('boards').select('id').eq('archived', false);
  if (!boards || boards.length === 0) return [];

  const ids = boards.map((b) => b.id as string).filter((id) => !exclude.includes(id));
  if (ids.length === 0) return [];

  const { data: states } = await supabase
    .from('board_ai_state')
    .select('board_id, next_due_at')
    .in('board_id', ids);

  const dueAt = new Map<string, number>();
  for (const s of states || []) dueAt.set(s.board_id as string, (s.next_due_at as number) || 0);

  return ids
    .filter((id) => (dueAt.get(id) ?? 0) <= now)
    .sort((a, b) => (dueAt.get(a) ?? 0) - (dueAt.get(b) ?? 0))
    .slice(0, limit);
}

/**
 * 1回の点検。見ている板を先に見て、余った枠で他の板の様子も見る。
 * 閲覧者からの呼び出しでも、定期実行からの呼び出しでも、入口はここ。
 */
export async function runAITick(options: {
  boardId?: string;
  backgroundBoards?: number;
}): Promise<{ outcomes: SpeakOutcome[]; budgetLeft: number }> {
  const config = await loadAIConfig();
  let budgetLeft = await remainingBudget(config);

  const outcomes: SpeakOutcome[] = [];

  if (budgetLeft <= 0) {
    return {
      outcomes: options.boardId
        ? [{ boardId: options.boardId, posted: false, reason: 'daily_budget_reached' }]
        : [],
      budgetLeft,
    };
  }

  const targets: string[] = [];
  if (options.boardId) targets.push(options.boardId);

  const extra = options.backgroundBoards ?? config.ai_background_boards;
  targets.push(...(await pickDueBoards(extra, targets)));

  for (const boardId of targets) {
    if (budgetLeft <= 0) break;
    const outcome = await speakOnBoard(boardId, config);
    outcomes.push(outcome);
    if (outcome.posted) budgetLeft--;
  }

  return { outcomes, budgetLeft };
}

/** 1つの板について、書くかどうかを決めて、書くなら書く */
export async function speakOnBoard(boardId: string, config: AIConfig): Promise<SpeakOutcome> {
  const now = Date.now();

  // 行が無ければ作る。作った直後は next_due_at = 0 なのですぐ点検対象になる
  await supabase
    .from('board_ai_state')
    .upsert({ board_id: boardId }, { onConflict: 'board_id', ignoreDuplicates: true });

  // 点検の権利を1つだけ取る。
  // 「順番が来ている」かつ「誰も処理中でない」board_ai_state の行を
  // 1回のUPDATEで押さえる。取れなかった呼び出しはここで帰る。
  const { data: claimed, error: claimError } = await supabase
    .from('board_ai_state')
    .update({ lease_until: now + 120000, last_check_at: now })
    .eq('board_id', boardId)
    .lte('next_due_at', now)
    .lt('lease_until', now)
    .select('board_id');

  if (claimError) {
    // マイグレーション未適用など。黙るのではなく理由を返す
    return { boardId, posted: false, reason: `state_unavailable: ${claimError.message}` };
  }
  if (!claimed || claimed.length === 0) {
    return { boardId, posted: false, reason: 'not_due' };
  }

  try {
    return await speakOnClaimedBoard(boardId, config, now);
  } finally {
    // 次に見る時刻を決めて、処理中の目印を外す。
    // 書いても書かなくても間隔を空ける。空けないと、確率に外れた板を
    // 呼ばれるたびに見にいくことになり、DBだけが無駄に回る。
    const interval = await nextInterval(boardId, config, now);
    await supabase
      .from('board_ai_state')
      .update({ lease_until: 0, next_due_at: now + interval })
      .eq('board_id', boardId);
  }
}

async function speakOnClaimedBoard(
  boardId: string,
  config: AIConfig,
  now: number
): Promise<SpeakOutcome> {
  // 判定に使うのは直近ぶんだけでよい。全件を読むとプロンプトも膨らむ
  const { data: postRows } = await supabase
    .from('posts')
    .select('*')
    .eq('board_id', boardId)
    .order('created_at', { ascending: false })
    .limit(40);

  const posts = (postRows || []) as Post[];
  const aiPosts = posts.filter((p) => p.author_type === 'ai');
  const state = detectSpaceState(posts);

  // AI密度
  if (posts.length > 0 && aiPosts.length / posts.length > config.max_ai_density) {
    return { boardId, posted: false, reason: 'density_exceeded', state };
  }

  // 確率的介入
  const probabilities: Record<string, number> = {
    FLOW: config.prob_flow,
    SILENCE: config.prob_silence,
    FRAGILE: config.prob_fragile,
    SOLO: config.prob_solo,
  };
  const probability = probabilities[state] ?? 0;
  if (Math.random() >= probability) {
    return { boardId, posted: false, reason: 'probability_not_met', state };
  }

  // ここから先は書くつもりで進む。住人が足りなければ増やす。
  // users にはAIも入っているので、人数を数えるときは必ず差し引く。
  // 差し引かないとAIがAIを呼んで増え続ける。
  let { data: characters } = await supabase.from('ai_characters').select('*').order('id');
  const aiIds = new Set((characters || []).map((c) => c.id as string));

  const { data: users } = await supabase
    .from('users')
    .select('id')
    .gte('last_seen', now - 3600000);
  const humanCount = (users || []).filter((u) => !aiIds.has(u.id as string)).length || 1;

  const population = await ensureAIPopulation(
    {
      ai_auto_populate: config.ai_auto_populate as boolean | undefined,
      ai_users_per_character: config.ai_users_per_character as number | undefined,
      ai_min_characters: config.ai_min_characters as number | undefined,
      ai_max_characters: config.ai_max_characters as number | undefined,
    },
    humanCount
  );
  if (population.created > 0) {
    ({ data: characters } = await supabase.from('ai_characters').select('*').order('id'));
  }

  if (!characters || characters.length === 0) {
    return { boardId, posted: false, reason: 'no_ai_characters', state };
  }

  const aiCharacter = pickCharacter(characters, posts, config, now);
  if (!aiCharacter) {
    return { boardId, posted: false, reason: 'all_ais_in_cooldown', state };
  }

  const { data: board } = await supabase
    .from('boards')
    .select('title, description')
    .eq('id', boardId)
    .single();

  // 返信にするか、新しく立てるか
  const lastPost = posts[0];
  const replyChance: Record<string, number> = { SOLO: 0.8, FRAGILE: 0.4, SILENCE: 0.2, FLOW: 0.1 };
  const shouldReply = Boolean(lastPost) && Math.random() < (replyChance[state] ?? 0);
  const thread_id = shouldReply && lastPost ? lastPost.thread_id || lastPost.id : null;
  const targetPost = shouldReply ? lastPost : undefined;

  const systemPrompt = buildResidentPrompt({
    commonPrompt: config.system_prompt,
    characterPrompt: aiCharacter.system_prompt,
    board: board ?? null,
    posts,
    state,
    isReply: Boolean(thread_id),
  });

  const writeNormally = () =>
    generateAIResponseWithGPT(
      systemPrompt,
      posts,
      targetPost,
      config.max_response_length,
      config.gpt_temperature,
      config.gpt_presence_penalty,
      config.gpt_frequency_penalty
    );

  // ニュースと画像は新しくスレッドを立てるときだけ。どちらも確率で起きる。
  // 失敗したら普通のテキストに戻す（黙るほどのことではない）
  let content: string | null;
  let mediaUrl: string | null = null;
  let isNewsPost = false;

  const special = thread_id ? null : await trySpecialPost(aiCharacter);

  if (special?.content) {
    content = special.content;
    mediaUrl = special.mediaUrl;
    isNewsPost = special.isNews;
  } else {
    content = await writeNormally();
  }

  // 生成に失敗したときは書かない。
  // 中身の無い相槌を板に残すより、黙っているほうが場が保たれる。
  if (!content || !content.trim()) {
    return { boardId, posted: false, reason: 'generation_failed', state };
  }

  const post: Post = {
    id: `ai-${now}-${Math.random().toString(36).slice(2, 8)}`,
    content,
    type: mediaUrl ? 'image' : 'text',
    created_at: Date.now(),
    thread_id,
    author_type: 'ai',
    author_id: aiCharacter.id,
    media_url: mediaUrl,
    board_id: boardId,
  };

  await ensureAIUser(aiCharacter.id);

  const { error: insertError } = await supabase.from('posts').insert([post]);
  if (insertError) {
    return { boardId, posted: false, reason: `insert_failed: ${insertError.message}`, state };
  }

  await supabase.from('ai_characters').update({ last_post_time: now }).eq('id', aiCharacter.id);
  await supabase
    .from('board_ai_state')
    .update({ last_ai_post_at: now })
    .eq('board_id', boardId);

  await supabase.from('logs').insert([
    {
      event_type: 'ai_intervention',
      user_id: aiCharacter.id,
      post_id: post.id,
      metadata: {
        state,
        content,
        board_id: boardId,
        is_reply: Boolean(thread_id),
        used_gpt: true,
        has_generated_image: Boolean(mediaUrl),
        is_news_post: isNewsPost,
        probability,
        ai_character: aiCharacter.name,
      },
      created_at: Date.now(),
    },
  ]);

  // リアクションは生成を伴わないので、費用の枠とは別で扱う
  if (shouldAIReact(state) && lastPost) {
    const reactingAI = characters[Math.floor(Math.random() * characters.length)];
    await ensureAIUser(reactingAI.id as string);
    const { error: reactionError } = await supabase.from('reactions').insert([
      {
        post_id: lastPost.id,
        user_id: reactingAI.id,
        emoji: selectRandomEmoji(),
        created_at: Date.now(),
      },
    ]);
    // 同じ絵文字が既に付いている場合は一意制約で弾かれる。書き込み自体は成立している
    if (reactionError) console.error('AI reaction failed:', reactionError.message);
  }

  return { boardId, posted: true, reason: 'posted', content, aiId: aiCharacter.id, state };
}

/**
 * 次にこの板を見にいくまでの間隔。
 *
 * 人が書き込んでいる板は短く、誰も来ていない板は長く。
 * 止まっている板も「たまには誰かが何か言う」状態にはしたいので、
 * 0にはしない（既定では3時間に一度だけ様子を見る）。
 */
async function nextInterval(boardId: string, config: AIConfig, now: number): Promise<number> {
  const { data } = await supabase
    .from('posts')
    .select('created_at')
    .eq('board_id', boardId)
    .order('created_at', { ascending: false })
    .limit(1);

  const lastPostAt = (data?.[0]?.created_at as number) || 0;
  const active = now - lastPostAt < config.ai_board_active_window;
  const base = active ? config.ai_board_interval_active : config.ai_board_interval_quiet;

  // 全部の板が同じ間隔で目を覚ますと、点検が同じ瞬間に固まる。±25%ずらす
  return Math.round(base * (0.75 + Math.random() * 0.5));
}

/** その板で直前に喋っていない住人から選ぶ */
function pickCharacter(
  characters: Array<Record<string, unknown>>,
  posts: Post[],
  config: AIConfig,
  now: number
): AICharacterRow | null {
  // この板での最終発言時刻。クールダウンは板ごとに見る。
  // 全板で共通にすると、1つの板で喋った住人が他の板でも黙ることになる。
  const lastInBoard = new Map<string, number>();
  for (const p of posts) {
    if (p.author_type !== 'ai') continue;
    if (!lastInBoard.has(p.author_id)) lastInBoard.set(p.author_id, p.created_at);
  }

  const eligible = characters.filter((c) => {
    const id = c.id as string;
    const frequency = (c.post_frequency as number) || 1.0;
    const base = config.cooldown_min + Math.random() * (config.cooldown_max - config.cooldown_min);
    return now - (lastInBoard.get(id) || 0) >= base / frequency;
  });

  if (eligible.length === 0) return null;
  return eligible[Math.floor(Math.random() * eligible.length)] as unknown as AICharacterRow;
}

/**
 * ニュースや画像を持ってくる住人のための寄り道。
 *
 * どちらも外部APIを叩くぶん高くつくので、新しくスレッドを立てるときだけ、
 * その住人に許可があり、かつ確率に当たったときに限る。
 * 失敗したら null を返して、呼び出し側で普通のテキストに戻す。
 */
async function trySpecialPost(
  character: AICharacterRow
): Promise<{ content: string; mediaUrl: string | null; isNews: boolean } | null> {
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  if (character.can_fetch_news && Math.random() < (character.news_fetch_probability ?? 0.1)) {
    try {
      const res = await fetch(`${base}/api/fetch-news`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiCharacterId: character.id }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.comment) return { content: data.comment, mediaUrl: null, isNews: true };
      }
    } catch (error) {
      console.error('News fetch failed:', error);
    }
    return null;
  }

  if (
    character.can_generate_images &&
    Math.random() < (character.image_generation_probability ?? 0.05)
  ) {
    try {
      const res = await fetch(`${base}/api/generate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiCharacterId: character.id }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.comment && data.imageUrl) {
          return { content: data.comment, mediaUrl: data.imageUrl, isNews: false };
        }
      }
    } catch (error) {
      console.error('Image generation failed:', error);
    }
  }

  return null;
}

async function ensureAIUser(aiId: string): Promise<void> {
  const { data } = await supabase.from('users').select('id').eq('id', aiId).single();
  if (data) {
    await supabase.from('users').update({ last_seen: Date.now() }).eq('id', aiId);
    return;
  }
  await supabase
    .from('users')
    .insert([{ id: aiId, created_at: Date.now(), last_seen: Date.now() }]);
}
