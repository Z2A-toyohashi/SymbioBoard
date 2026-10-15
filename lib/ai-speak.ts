import type { Post } from '@/types';
import { supabase } from './supabase-client';
import { detectSpaceState } from './ai-logic';
import { generateAIResponseWithGPT } from './gpt';
import { buildResidentPrompt } from './prompt';
import { ensureAIPopulation } from './ai-population';
import { shouldAIReact, selectRandomEmoji } from './ai-manager';
import { generateMatchingImage, searchAndComment, type ExtraResult } from './ai-extra';

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
  gpt_model: string;
  image_model: string;
  image_quality: string;
  ai_image_followup_probability: number;
  ai_image_daily_budget: number;
  ai_search_followup_probability: number;
  ai_search_daily_budget: number;
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
  gpt_model: 'gpt-4.1-mini',
  image_model: 'gpt-image-1',
  image_quality: 'medium',
  ai_image_followup_probability: 0.05,
  ai_image_daily_budget: 2,
  ai_search_followup_probability: 0.08,
  ai_search_daily_budget: 5,
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
    // 書かないときでも、スタンプだけ押していくことがある。
    // 生成を伴わないので費用はかからず、「見ている人がいる」感じだけが残る。
    const reacted = await reactSometimes(posts, state);
    return {
      boardId,
      posted: false,
      reason: reacted ? 'reacted_only' : 'probability_not_met',
      state,
    };
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
      config.gpt_frequency_penalty,
      config.gpt_model
    );

  const content = await writeNormally();

  // 生成に失敗したときは書かない。
  // 中身の無い相槌を板に残すより、黙っているほうが場が保たれる。
  if (!content || !content.trim()) {
    return { boardId, posted: false, reason: 'generation_failed', state };
  }

  const post: Post = {
    id: `ai-${now}-${Math.random().toString(36).slice(2, 8)}`,
    content,
    type: 'text',
    created_at: Date.now(),
    thread_id,
    author_type: 'ai',
    author_id: aiCharacter.id,
    media_url: null,
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
        probability,
        ai_character: aiCharacter.name,
      },
      created_at: Date.now(),
    },
  ]);

  // たまに、いま書いたことに合う写真を貼る／調べた話を続ける
  const followUp = await maybeFollowUp({
    parent: post,
    boardId,
    boardTitle: board?.title,
    character: aiCharacter,
    config,
  });

  // リアクションは生成を伴わないので、費用の枠とは別で扱う
  await reactSometimes(posts, state);

  return {
    boardId,
    posted: true,
    reason: followUp ? `posted+${followUp}` : 'posted',
    content,
    aiId: aiCharacter.id,
    state,
  };
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
 * 書いたあとの寄り道。
 *
 * たまに、いま書いたことに合う写真を貼ったり、気になって調べた話を続けたりする。
 * どちらも本文への返信として、少し間を置いて置かれる。
 *
 * 蓋は三重。確率（既定5〜8%）、1日の枚数・回数、そして住人ごとの許可。
 * 画像は1枚が本文1回の百倍以上かかるので、枚数の上限は本文とは別に持つ。
 */
async function maybeFollowUp(args: {
  parent: Post;
  boardId: string;
  boardTitle?: string;
  character: AICharacterRow;
  config: AIConfig;
}): Promise<'image' | 'search' | null> {
  const { parent, boardId, boardTitle, character, config } = args;

  // 住人ごとの設定は「上乗せ」として扱う。
  // 許可が付いている住人はよく貼り、付いていない住人もまれに貼る。
  const imageChance = character.can_generate_images
    ? Math.max(config.ai_image_followup_probability, character.image_generation_probability ?? 0)
    : config.ai_image_followup_probability;

  const searchChance = character.can_fetch_news
    ? Math.max(config.ai_search_followup_probability, character.news_fetch_probability ?? 0)
    : config.ai_search_followup_probability;

  let extra: ExtraResult | null = null;
  let kind: 'image' | 'search' | null = null;

  if (Math.random() < imageChance && (await withinDailyLimit('image', config))) {
    extra = await generateMatchingImage({
      postContent: parent.content,
      characterPrompt: character.system_prompt,
      characterId: character.id,
      boardTitle,
      model: config.image_model,
      quality: config.image_quality,
      maxLength: config.max_response_length,
    });
    kind = extra ? 'image' : null;
  }

  if (!extra && Math.random() < searchChance && (await withinDailyLimit('search', config))) {
    extra = await searchAndComment({
      postContent: parent.content,
      characterPrompt: character.system_prompt,
      boardTitle,
      model: config.gpt_model,
      maxLength: Math.max(config.max_response_length, 80),
    });
    kind = extra ? 'search' : null;
  }

  if (!extra || !kind) return null;

  const now = Date.now();
  const followUp: Post = {
    id: `ai-${now}-${Math.random().toString(36).slice(2, 8)}`,
    content: extra.content,
    type: extra.mediaUrl ? 'image' : 'text',
    created_at: now,
    // 自分の書き込みへの返信として置く。独立した投稿にすると脈絡が切れる
    thread_id: parent.thread_id || parent.id,
    author_type: 'ai',
    author_id: character.id,
    media_url: extra.mediaUrl,
    board_id: boardId,
  };

  const { error } = await supabase.from('posts').insert([followUp]);
  if (error) {
    console.error('Follow-up post failed:', error.message);
    return null;
  }

  await supabase.from('logs').insert([
    {
      event_type: kind === 'image' ? 'ai_image' : 'ai_search',
      user_id: character.id,
      post_id: followUp.id,
      metadata: {
        board_id: boardId,
        parent_post_id: parent.id,
        content: extra.content,
        model: kind === 'image' ? config.image_model : config.gpt_model,
        quality: kind === 'image' ? config.image_quality : null,
      },
      created_at: now,
    },
  ]);

  return kind;
}

/** 今日の枚数・回数がまだ残っているか */
async function withinDailyLimit(kind: 'image' | 'search', config: AIConfig): Promise<boolean> {
  const limit = kind === 'image' ? config.ai_image_daily_budget : config.ai_search_daily_budget;
  if (limit <= 0) return false;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from('logs')
    .select('id', { count: 'exact', head: true })
    .eq('event_type', kind === 'image' ? 'ai_image' : 'ai_search')
    .gte('created_at', startOfDay.getTime());

  return (count || 0) < limit;
}

/**
 * スタンプを押す。
 *
 * 書き込みと違って生成を伴わないので、API費用はかからない。
 * 板の空気（しずか・ひとりごとほど押しやすい）で確率が変わる。
 *
 * 押す先は人の書き込みを優先する。AI同士で押し合っても場は温まらないし、
 * 押された側からすると「誰かが見ている」ことだけが伝わればよい。
 */
async function reactSometimes(posts: Post[], state: string): Promise<boolean> {
  if (!shouldAIReact(state)) return false;

  // 直近の書き込みから、人が書いたものを優先して選ぶ
  const recent = posts.slice(0, 8);
  const humanPosts = recent.filter((p) => p.author_type === 'user');
  const pool = humanPosts.length > 0 ? humanPosts : recent;
  if (pool.length === 0) return false;

  const target = pool[Math.floor(Math.random() * pool.length)];

  const { data: characters } = await supabase.from('ai_characters').select('id');
  if (!characters || characters.length === 0) return false;

  // 自分の書き込みには押さない
  const others = characters.filter((c) => (c.id as string) !== target.author_id);
  if (others.length === 0) return false;

  const reactingAI = others[Math.floor(Math.random() * others.length)].id as string;
  await ensureAIUser(reactingAI);

  const { error } = await supabase.from('reactions').insert([
    {
      post_id: target.id,
      user_id: reactingAI,
      emoji: selectRandomEmoji(),
      created_at: Date.now(),
    },
  ]);

  // 同じ絵文字が既に押されている場合は一意制約で弾かれる。異常ではない
  if (error && !error.message.includes('duplicate')) {
    console.error('AI reaction failed:', error.message);
    return false;
  }

  return !error;
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
