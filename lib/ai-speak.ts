import type { Post, SpaceState } from '@/types';
import { supabase } from './supabase-client';
import { detectSpaceState } from './ai-logic';
import { generateAIResponseWithGPT } from './gpt';
import { buildResidentPrompt } from './prompt';
import { ensureAIPopulation } from './ai-population';
import { shouldAIReact, REACTION_EMOJIS } from './ai-manager';
import { generateMatchingImage, searchAndComment } from './ai-extra';
import { maybeCreateBoard } from './ai-board';
import { createStampAsResident } from './ai-stamp';
import { wakefulness } from './ai-hours';
import { isWithinBoardGrace } from './board-grace';
import { planLength } from './ai-length';
import { sampleKaomoji, usesKaomoji } from './kaomoji';
import { loadAIIds } from './ai-ids';

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

/** AI密度を見る範囲。板の全履歴ではなく直近この件数で見る */
const DENSITY_WINDOW = 20;

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
  ai_board_creation_probability: number;
  ai_board_creation_daily_budget: number;
  ai_max_boards: number;
  /** 住人がスタンプを作る見込みと、1日の個数（lib/ai-stamp.ts） */
  ai_stamp_probability: number;
  ai_stamp_daily_budget: number;
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
  ai_board_interval_active: 300000,
  ai_board_interval_quiet: 1800000,
  ai_board_active_window: 1800000,
  ai_background_boards: 1,
  gpt_model: 'gpt-4.1-mini',
  image_model: 'gpt-image-1',
  image_quality: 'medium',
  ai_image_followup_probability: 0.05,
  ai_image_daily_budget: 2,
  ai_search_followup_probability: 0.08,
  ai_search_daily_budget: 5,
  ai_board_creation_probability: 0.05,
  ai_board_creation_daily_budget: 1,
  ai_max_boards: 12,
  // スタンプは絵を1枚作るので、写真と同じだけ高い。確率も個数もかなり絞る
  ai_stamp_probability: 0.02,
  ai_stamp_daily_budget: 1,
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
  /** 起きている時間帯（0〜23）。無ければ常に起きている扱い。lib/ai-hours.ts */
  awake_from?: number | null;
  awake_to?: number | null;
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
}): Promise<{ outcomes: SpeakOutcome[]; budgetLeft: number; createdBoard?: string | null }> {
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

  // ごくたまに、新しい板が立つ。条件は lib/ai-board.ts 側で厳しく見る
  let createdBoard: string | null = null;
  if (budgetLeft > 0) {
    const created = await maybeCreateBoard(config);
    if (created) {
      createdBoard = created.title;
      // 板の案を考えた1回ぶん。最初の一行は後から書かれるので、
      // そのときに点検の枠から引かれる（lib/ai-board.ts の「最初の一行は書かない」）
      budgetLeft -= 1;
    }
  }

  return { outcomes, budgetLeft, createdBoard };
}

/** 1つの板について、書くかどうかを決めて、書くなら書く */
export async function speakOnBoard(boardId: string, config: AIConfig): Promise<SpeakOutcome> {
  const now = Date.now();

  // 行が無ければ作る。作った直後は next_due_at = 0 なのですぐ点検対象になる
  await supabase
    .from('board_ai_state')
    .upsert({ board_id: boardId }, { onConflict: 'board_id', ignoreDuplicates: true });

  // 行が読めるかを先に確かめる。
  // テーブルにRLSが有効でポリシーが無いと、読み書きはエラーにならず
  // 「0行」として返る。そのまま進むと、取れるはずのない点検権を待ち続けて
  // 板が永久に黙る。読めないと分かった時点で、状態なしの道に切り替える。
  const { data: existing, error: readError } = await supabase
    .from('board_ai_state')
    .select('board_id')
    .eq('board_id', boardId)
    .maybeSingle();

  if (readError || !existing) {
    console.error(
      'board_ai_state is not readable:',
      readError?.message ?? '行が作られていません（RLSのポリシーを確認）'
    );
    return await speakWithoutState(boardId, config, now);
  }

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
    // board_ai_state が無い（migration-004 未適用）。
    // ここで黙ってしまうと、マイグレーションを流すまで板が完全に止まる。
    // 間隔の管理だけ落として、投稿そのものは続ける。
    console.error('board_ai_state unavailable:', claimError.message);
    return await speakWithoutState(boardId, config, now);
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

/**
 * board_ai_state が無いときの代わりの道。
 *
 * 「次にいつ見るか」を保存できないので、その板で最後にAIが書いた時刻から
 * 毎回計算し直す。二重起動も防げないが、板が止まるよりはいい。
 * 理由に印を付けて返すので、点検画面でマイグレーション漏れだと分かる。
 */
async function speakWithoutState(
  boardId: string,
  config: AIConfig,
  now: number
): Promise<SpeakOutcome> {
  const { data } = await supabase
    .from('posts')
    .select('created_at')
    .eq('board_id', boardId)
    .eq('author_type', 'ai')
    .order('created_at', { ascending: false })
    .limit(1);

  const lastAIPostAt = (data?.[0]?.created_at as number) || 0;
  const interval = await nextInterval(boardId, config, now);

  if (now - lastAIPostAt < interval) {
    return { boardId, posted: false, reason: 'not_due (no board_ai_state)' };
  }

  const outcome = await speakOnClaimedBoard(boardId, config, now);
  return { ...outcome, reason: `${outcome.reason} (no board_ai_state)` };
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
  const state = detectSpaceState(posts);

  // 閉じられた板には書かない。
  // board_ai_state の行は板を閉じても残るので、ここで見ないと
  // 一覧から下がった板にAIだけが書き続ける。
  const board = await loadBoard(boardId);

  if (!board.title || board.archived) {
    return { boardId, posted: false, reason: 'board_closed', state };
  }

  /**
   * 立てたばかりの板では、まだ誰も来ない。
   *
   * 立てた直後に書き込みが入ると、それだけで住人だと分かる
   * （人は、できたばかりの板を数秒で見つけて書いたりしない）。
   * 住人が立てた板も同じで、開設と同時刻の1件目は正体を明かしてしまう。
   * 間の取り方は lib/board-grace.ts。
   */
  if (isWithinBoardGrace(boardId, board.created_at, now)) {
    return { boardId, posted: false, reason: 'board_too_new', state };
  }

  /**
   * 住人が立てた板の、最初の一行。
   *
   * 以前は板を立てたその場で書いていた（lib/ai-board.ts）。
   * 開設と同時刻に1件目があり、立てた人と書き手が同じIDなので、
   * そのIDが住人だと確定していた。いまは間を置いてから、
   * **立てた本人**がここで書く。
   *
   * 空の板を空のまま放置はしない（壊れて見える）ので、
   * この一行だけは密度も確率も飛ばす。返信に答えるのと同じ扱い。
   */
  let openingCharacter: AICharacterRow | null = null;
  if (posts.length === 0 && board.created_by) {
    const { data } = await supabase
      .from('ai_characters')
      .select('*')
      .eq('id', board.created_by)
      .maybeSingle();
    if (data) openingCharacter = data as unknown as AICharacterRow;
  }

  /**
   * 自分あての返信に答える。
   *
   * 人がAIの書き込みに返信したのに、そのAIが黙っているのが一番おかしい。
   * 他の住人が代わりに答えるのも違う。話しかけられた本人が答える。
   *
   * ここだけは密度と確率を飛ばす。問いかけに対する返事を
   * 「AIが書きすぎているから」で止めると、ただの無視になるため。
   */
  const answered = await answerPendingReply(posts, board, config, boardId, now, state);
  if (answered) return answered;

  /**
   * AI密度。
   *
   * 板の全履歴で見てはいけない。小さい板では、AIが一度半分を超えると
   * 人が書き足すまで永久に黙る。実際、人9件・AI5件の板が
   * 「上限0.5を超えている」として何時間も止まっていた。
   *
   * 見るのは直近20件だけにする。AIが続けて書けば止まり、
   * 人が書けばまた書けるようになる、という動きになる。
   */
  const window = posts.slice(0, DENSITY_WINDOW);
  const aiInWindow = window.filter((p) => p.author_type === 'ai').length;
  const density = window.length > 0 ? aiInWindow / window.length : 0;

  // 板ごとの上限があればそれを使う。無ければ場の設定
  const maxDensity = board.ai_max_density ?? config.max_ai_density;

  // 板ごと止まって長い場合は、密度を理由に黙らない。
  // 誰も書かないまま閉じていく板を、密度の計算で看取る理由はない。
  const lastPostAt = posts[0]?.created_at ?? 0;
  const dormant = lastPostAt > 0 && now - lastPostAt > config.ai_board_interval_quiet * 4;

  if (!openingCharacter && !dormant && density > maxDensity) {
    return { boardId, posted: false, reason: 'density_exceeded', state };
  }

  // 確率的介入
  const probabilities: Record<string, number> = {
    FLOW: config.prob_flow,
    SILENCE: config.prob_silence,
    FRAGILE: config.prob_fragile,
    SOLO: config.prob_solo,
  };
  // 板ごとの倍率。立てたばかりで誰もいない板は上げ、人が多い板は下げる
  const scale = board.ai_probability_scale ?? 1;
  const probability = Math.min(1, (probabilities[state] ?? 0) * scale);

  // 立てた本人の最初の一行だけは、確率で黙らない（空の板を残さない）
  if (!openingCharacter && Math.random() >= probability) {
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

  /**
   * 差し引く相手は、名簿（ai_characters）に居る住人だけでは足りない。
   *
   * 管理画面から住人を消すと名簿の行だけが消えて、users の行は残る。
   * その残りを人として数えると、消した数だけ「人が増えた」ことになり、
   * 増えた人数に合わせて住人がまた増える。AIがAIを呼ぶ形になる。
   * 書いたものから見る（lib/ai-ids.ts）。
   */
  const aiIds = await loadAIIds();

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

  /**
   * 書く住人。
   *
   * 住人が立てた板の最初の一行は、立てた本人が書く。
   * 別の住人が書くと、立てた人が自分の板に一度も現れないことになる。
   * ここでは間隔（クールダウン）も生活時間も見ない。板を立てた直後だから。
   */
  const aiCharacter = openingCharacter ?? pickCharacter(characters, posts, config, now);
  if (!aiCharacter) {
    return { boardId, posted: false, reason: 'all_ais_in_cooldown', state };
  }

  /**
   * 誰に返信するか。
   *
   * 直前の書き込みに無条件で返すと、AIがAIに返し、それにまたAIが返す。
   * 人がいない時間帯ほどそうなり、板がAI同士の会話で埋まる。
   * それを避けるために返信の確率をかなり下げていたのだが、下げすぎていた。
   *
   * 結果、板は「20スレ/24レス」のような姿になっていた。
   * 話しかけた数ばかりが増えて、誰も誰にも答えていない。
   * 掲示板として読めるのは、新しい話題が並ぶからではなく、
   * 書いたものに誰かが応えるからなので、これでは場にならない。
   *
   * そこで、次の順に考える。
   *
   *   1. 返事のついていない書き込みがあるなら、まずそれに返す
   *   2. 返信先は人の書き込みを優先する
   *   3. AI同士で延びすぎた流れには、それ以上ぶら下がらない
   */
  const replyChance: Record<string, number> = { SOLO: 0.9, FRAGILE: 0.75, SILENCE: 0.65, FLOW: 0.45 };

  const byId = new Map(posts.map((p) => [p.id, p]));
  const hasReply = new Set(posts.map((p) => p.thread_id).filter(Boolean) as string[]);

  /**
   * その書き込みが、AIだけのやり取りの何代目か。
   * 人が一人でも挟まっていれば0に戻す。
   * 3代続いたらもう足さない。読む人のいない会話が伸びるだけなので。
   */
  const aiChainDepth = (post: Post): number => {
    let depth = 0;
    let cursor: Post | undefined = post;
    while (cursor && cursor.author_type === 'ai' && depth < 8) {
      depth++;
      cursor = cursor.thread_id ? byId.get(cursor.thread_id) : undefined;
    }
    return depth;
  };

  const candidates = posts
    .slice(0, 8)
    .filter((p) => p.author_id !== aiCharacter.id)
    .filter((p) => aiChainDepth(p) < 3);

  const unanswered = candidates.filter((p) => !hasReply.has(p.id));
  const unansweredHuman = unanswered.filter((p) => p.author_type === 'user');
  const recentHuman = candidates.filter((p) => p.author_type === 'user');

  const target =
    unansweredHuman[0] ?? recentHuman[0] ?? unanswered[0] ?? candidates[0];

  let chance = replyChance[state] ?? 0;

  // AI相手は下げる。ただし四分の一まで落とすと、人のいない時間に誰も応えなくなる
  if (target && target.author_type === 'ai') chance *= 0.55;

  /**
   * 置き去りが溜まっているときは、新しい話題より先に返す。
   * 返事のない書き込みが並んでいる板に、さらに話題を足しても読めるものにならない。
   *
   * ただし相手もAIなら上げ幅は抑える。ここを人と同じだけ上げると、
   * 人がいない時間に、返事のないAIの書き込みへAIが返し続ける板になる。
   */
  if (unanswered.length >= 2) {
    chance = Math.max(chance, target?.author_type === 'user' ? 0.9 : 0.6);
  }

  const shouldReply = Boolean(target) && Math.random() < chance;

  // 返信先はそのレス自身。板の表示が一本になったので、
  // スレッドの先頭に付け替える必要はない（宛先は >>番号 で出る）
  const thread_id = shouldReply && target ? target.id : null;
  const targetPost = shouldReply ? target : undefined;

  const basePrompt = buildResidentPrompt({
    commonPrompt: config.system_prompt,
    characterPrompt: aiCharacter.system_prompt,
    board,
    posts,
    state,
    isReply: Boolean(thread_id),
    // 顔文字を使う住人にだけ、毎回違う組み合わせを渡す
    kaomoji: usesKaomoji(aiCharacter.id) ? sampleKaomoji(5) : [],
  });

  /**
   * この回の長さ。
   *
   * 毎回「60文字以内、1〜2文」だったので、住人の書き込みは長さが揃っていた。
   * 人は「わかる」の3文字で済ませることも、長く書くこともある。
   * 帯を引いて、ひと言から長めまでばらす（lib/ai-length.ts）。
   */
  const lengthPlan = planLength({
    maxResponseLength: config.max_response_length,
    residentId: aiCharacter.id,
    isReply: Boolean(thread_id),
  });

  /**
   * 自分で立てた板の一行目。
   *
   * 「立てたばかり」は書かない。立ててから少し経っているので、
   * 時間を言い当てる文（立てたところです等）は板の見え方と食い違う。
   */
  const systemPrompt = openingCharacter
    ? `${basePrompt}\n\nこの板はあなたが立てたものです。まだ誰も書いていません。` +
      `最初の一行を置いてください。説明や挨拶ではなく、あなた自身の話から始めます。` +
      `板を立てたこと自体には触れません。`
    : basePrompt;

  const writeNormally = () =>
    generateAIResponseWithGPT(
      systemPrompt,
      posts,
      targetPost,
      config.max_response_length,
      config.gpt_temperature,
      config.gpt_presence_penalty,
      config.gpt_frequency_penalty,
      config.gpt_model,
      lengthPlan
    );

  const content = await writeNormally();

  // 生成に失敗したときは書かない。
  // 中身の無い相槌を板に残すより、黙っているほうが場が保たれる。
  if (!content || !content.trim()) {
    return { boardId, posted: false, reason: 'generation_failed', state };
  }

  /**
   * 写真は、この書き込みそのものに添える。
   *
   * 以前は別の書き込みとして自分の投稿にぶら下げていたが、
   * 同じIDが自分の書き込みに即レスして他人行儀な感想を言う形になり、
   * 人の掲示板では見ない並びになっていた。
   * 写真を貼るなら、貼りたいことを書いたその書き込みに付く。
   */
  const photo = await maybeAttachPhoto({ content, character: aiCharacter, config });

  const post: Post = {
    id: `ai-${now}-${Math.random().toString(36).slice(2, 8)}`,
    content: photo?.caption ? `${content}
${photo.caption}` : content,
    type: photo ? 'image' : 'text',
    created_at: Date.now(),
    thread_id,
    author_type: 'ai',
    author_id: aiCharacter.id,
    media_url: photo?.mediaUrl ?? null,
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

  // たまに、気になって調べた話を自分で書き足す（写真は本文に添え済み）
  const followUp = await maybeSearchFollowUp({
    parent: post,
    boardId,
    boardTitle: board?.title,
    character: aiCharacter,
    config,
  });

  // リアクションは生成を伴わないので、費用の枠とは別で扱う
  await reactSometimes(posts, state);

  // ごくたまに、板の流れからスタンプを作る（作る側が人だけだと住人が割れる）
  const stamp = await maybeCreateStamp({
    posts,
    boardTitle: board?.title,
    character: aiCharacter,
    config,
  });

  return {
    boardId,
    posted: true,
    reason: [photo ? 'photo' : null, followUp ? 'search' : null, stamp ? 'stamp' : null].filter(
      Boolean
    ).length
      ? `posted+${[photo ? 'photo' : null, followUp ? 'search' : null, stamp ? 'stamp' : null]
          .filter(Boolean)
          .join('+')}`
      : 'posted',
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
  const [{ data }, board] = await Promise.all([
    supabase
      .from('posts')
      .select('created_at')
      .eq('board_id', boardId)
      .order('created_at', { ascending: false })
      .limit(1),
    loadBoard(boardId),
  ]);

  const lastPostAt = (data?.[0]?.created_at as number) || 0;
  const active = now - lastPostAt < config.ai_board_active_window;

  // 板ごとの間隔があればそれを使う。無ければ場の設定
  const base = active
    ? (board.ai_interval_active ?? config.ai_board_interval_active)
    : (board.ai_interval_quiet ?? config.ai_board_interval_quiet);

  // 全部の板が同じ間隔で目を覚ますと、点検が同じ瞬間に固まる。±25%ずらす
  return Math.round(base * (0.75 + Math.random() * 0.5));
}

/**
 * その板で直前に喋っていない住人から選ぶ。
 *
 * 選ばれやすさは、人格ごとの出やすさ（post_frequency）に
 * いまの時間の生活ぶん（lib/ai-hours.ts）を掛けたもので決まる。
 * 眠っている時間帯の住人は間隔が長くなるが、黙りはしない。
 * 全員が同じ時間に黙ると、その時間の書き込みが人だけになってしまう。
 */
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
    const frequency =
      ((c.post_frequency as number) || 1.0) *
      wakefulness(
        {
          awake_from: c.awake_from as number | null | undefined,
          awake_to: c.awake_to as number | null | undefined,
        },
        now
      );
    const base = config.cooldown_min + Math.random() * (config.cooldown_max - config.cooldown_min);
    return now - (lastInBoard.get(id) || 0) >= base / frequency;
  });

  if (eligible.length === 0) return null;
  return eligible[Math.floor(Math.random() * eligible.length)] as unknown as AICharacterRow;
}

/**
 * 書き込みに写真を添えるかどうか。
 *
 * 添えるのは、その書き込みそのもの。別の書き込みにはしない。
 * 自分の書き込みに自分で返信して「いい写真ですね」と言うのは、人のやることではない。
 *
 * 蓋は三重。確率（既定5%）、1日の枚数、そして住人ごとの許可。
 * さらに生成側でも「写すものが本文に無ければ貼らない」を見ている。
 * 画像は1枚が本文1回の百倍以上かかるので、枚数の上限は本文とは別に持つ。
 */
async function maybeAttachPhoto(args: {
  content: string;
  character: AICharacterRow;
  config: AIConfig;
}): Promise<{ mediaUrl: string; caption: string } | null> {
  const { content, character, config } = args;

  // 住人ごとの設定は「上乗せ」として扱う。
  // 許可が付いている住人はよく貼り、付いていない住人もまれに貼る。
  const chance = character.can_generate_images
    ? Math.max(config.ai_image_followup_probability, character.image_generation_probability ?? 0)
    : config.ai_image_followup_probability;

  if (Math.random() >= chance) return null;
  if (!(await withinDailyLimit('image', config))) return null;

  const photo = await generateMatchingImage({
    postContent: content,
    commonPrompt: config.system_prompt,
    characterPrompt: character.system_prompt,
    characterId: character.id,
    model: config.image_model,
    quality: config.image_quality,
    maxLength: config.max_response_length,
  });

  if (!photo) return null;

  await supabase.from('logs').insert([
    {
      event_type: 'ai_image',
      user_id: character.id,
      post_id: null,
      metadata: { content: photo.caption, model: config.image_model, quality: config.image_quality },
      created_at: Date.now(),
    },
  ]);

  return photo;
}

/**
 * 書いたあとに、気になって調べた話を自分で書き足す。
 *
 * これは自己レスになる。掲示板では自然な形だが、
 * 「調べて分かったこと」でないなら書かない。
 */
async function maybeSearchFollowUp(args: {
  parent: Post;
  boardId: string;
  boardTitle?: string;
  character: AICharacterRow;
  config: AIConfig;
}): Promise<boolean> {
  const { parent, boardId, boardTitle, character, config } = args;

  const chance = character.can_fetch_news
    ? Math.max(config.ai_search_followup_probability, character.news_fetch_probability ?? 0)
    : config.ai_search_followup_probability;

  if (Math.random() >= chance) return false;
  if (!(await withinDailyLimit('search', config))) return false;

  const extra = await searchAndComment({
    postContent: parent.content,
    commonPrompt: config.system_prompt,
    characterPrompt: character.system_prompt,
    boardTitle,
    model: config.gpt_model,
    maxLength: Math.max(config.max_response_length, 80),
  });

  if (!extra) return false;

  const now = Date.now();
  const followUp: Post = {
    id: `ai-${now}-${Math.random().toString(36).slice(2, 8)}`,
    content: extra.content,
    type: 'text',
    created_at: now,
    // 自分の書き込みへの続きとして置く
    thread_id: parent.thread_id || parent.id,
    author_type: 'ai',
    author_id: character.id,
    media_url: null,
    board_id: boardId,
  };

  const { error } = await supabase.from('posts').insert([followUp]);
  if (error) {
    console.error('Follow-up post failed:', error.message);
    return false;
  }

  await supabase.from('logs').insert([
    {
      event_type: 'ai_search',
      user_id: character.id,
      post_id: followUp.id,
      metadata: {
        board_id: boardId,
        parent_post_id: parent.id,
        content: extra.content,
        model: config.gpt_model,
      },
      created_at: now,
    },
  ]);

  return true;
}

/** 今日の枚数・回数がまだ残っているか */
async function withinDailyLimit(
  kind: 'image' | 'search' | 'stamp',
  config: AIConfig
): Promise<boolean> {
  const limits: Record<typeof kind, number> = {
    image: config.ai_image_daily_budget,
    search: config.ai_search_daily_budget,
    stamp: config.ai_stamp_daily_budget,
  };
  const events: Record<typeof kind, string> = {
    image: 'ai_image',
    search: 'ai_search',
    stamp: 'ai_stamp',
  };

  const limit = limits[kind];
  if (limit <= 0) return false;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from('logs')
    .select('id', { count: 'exact', head: true })
    .eq('event_type', events[kind])
    .gte('created_at', startOfDay.getTime());

  return (count || 0) < limit;
}

/**
 * 住人がスタンプを作る。
 *
 * 作れるのが人だけだと、作った人のIDから住人が割れていく（lib/ai-stamp.ts）。
 * ここは費用の蓋だけを持って、中身はあちらに任せる。
 */
async function maybeCreateStamp(args: {
  posts: Post[];
  boardTitle?: string;
  character: AICharacterRow;
  config: AIConfig;
}): Promise<string | null> {
  const { posts, boardTitle, character, config } = args;

  if (Math.random() >= config.ai_stamp_probability) return null;
  if (!(await withinDailyLimit('stamp', config))) return null;

  const created = await createStampAsResident({
    recent: posts
      .slice(0, 8)
      .map((p) => p.content)
      .filter(Boolean),
    boardTitle,
    characterId: character.id,
    characterPrompt: character.system_prompt,
  });

  if (!created) return null;

  await supabase.from('logs').insert([
    {
      event_type: 'ai_stamp',
      user_id: character.id,
      post_id: null,
      metadata: { stamp_id: created.id, name: created.name, board_title: boardTitle ?? null },
      created_at: Date.now(),
    },
  ]);

  return created.name;
}

/**
 * スタンプを押す。
 *
 * 書き込みと違って生成を伴わないので、API費用はかからない。
 * 板の空気（しずか・ひとりごとほど押しやすい）で確率が変わる。
 *
 * 押す先は人の書き込みを優先する。AI同士で押し合っても場は温まらないし、
 * 押された側からすると「誰かが見ている」ことだけが伝わればよい。
 *
 * 住人もスタンプ帳を持つ。
 *
 *   人が作ったスタンプを住人が一度も押さないと、
 *   「このIDは既定の6個しか押さない」という癖がIDごとに残る。
 *   押した人のIDは画面に出るので、何十レスか眺めれば住人のIDが割れてしまう。
 *   人かAIかが分からないことがこの場の中身なので、それは壊れる。
 *
 *   だから住人も、人と同じ道（その板で使われているものを押す）で増やす。
 *   持ち物から押すのが普通で、ときどき知らないものに手を出して覚える。
 *
 * 相手と絵文字を完全な運任せにすると、既に押してある同じ組み合わせを引いて
 * 一意制約で弾かれ、その回は何も起きずに終わる。いま押されているものを先に見る。
 */

/** 知らないスタンプに手を出す割合。高いと住人だけが流行に乗りすぎる */
const STAMP_ADOPT_RATE = 0.3;

async function reactSometimes(posts: Post[], state: string): Promise<boolean> {
  if (!shouldAIReact(state)) return false;

  const recent = posts.slice(0, 10);
  if (recent.length === 0) return false;

  const { data: characters } = await supabase.from('ai_characters').select('id');
  if (!characters || characters.length === 0) return false;

  const aiIds = (characters as Array<{ id: string }>).map((c) => c.id);

  const [{ data: existing }, { data: activeStamps }, { data: palettes }] = await Promise.all([
    // いま押されているもの
    supabase
      .from('reactions')
      .select('post_id, user_id, emoji')
      .in(
        'post_id',
        recent.map((p) => p.id)
      ),
    // 止まっていないスタンプ。止められたものは住人も押さない
    supabase.from('stamps').select('id').eq('disabled', false),
    // 住人それぞれの持ち物
    supabase.from('user_stamps').select('user_id, stamp_id').in('user_id', aiIds),
  ]);

  const live = new Set<string>([
    ...REACTION_EMOJIS,
    ...((activeStamps || []) as Array<{ id: string }>).map((s) => s.id),
  ]);

  const pressed = new Map<string, Set<string>>();
  const boardStamps = new Set<string>();
  for (const row of (existing || []) as Array<{
    post_id: string;
    user_id: string;
    emoji: string;
  }>) {
    if (!pressed.has(row.post_id)) pressed.set(row.post_id, new Set());
    pressed.get(row.post_id)!.add(`${row.user_id}:${row.emoji}`);
    if (live.has(row.emoji)) boardStamps.add(row.emoji);
  }

  // 持ち物。既定の6個は全員が最初から持っている
  const palette = new Map<string, Set<string>>();
  for (const id of aiIds) palette.set(id, new Set(REACTION_EMOJIS));
  for (const row of (palettes || []) as Array<{ user_id: string; stamp_id: string }>) {
    if (live.has(row.stamp_id)) palette.get(row.user_id)?.add(row.stamp_id);
  }

  const pressCount = (postId: string) => pressed.get(postId)?.size ?? 0;

  /**
   * 押す相手。
   * 人の書き込みを先に、そのうち押された数が少ないものから選ぶ。
   * 同じ書き込みにばかり溜まると、他が読まれていないように見える。
   */
  const humanPosts = recent.filter((p) => p.author_type === 'user');
  const pool = (humanPosts.length > 0 ? humanPosts : recent)
    .slice()
    .sort((a, b) => pressCount(a.id) - pressCount(b.id));

  for (const target of pool.slice(0, 4)) {
    const taken = pressed.get(target.id) ?? new Set<string>();

    // 自分の書き込みには押さない
    const others = aiIds.filter((id) => id !== target.author_id);

    for (const aiId of shuffle(others)) {
      const mine = palette.get(aiId) ?? new Set(REACTION_EMOJIS);

      // この板で使われていて、自分がまだ持っていないもの
      const unknown = Array.from(boardStamps).filter((id) => !mine.has(id));
      const adopting = unknown.length > 0 && Math.random() < STAMP_ADOPT_RATE;

      const choices = (adopting ? unknown : Array.from(mine)).filter(
        (id) => !taken.has(`${aiId}:${id}`)
      );
      if (choices.length === 0) continue;

      const stampId = choices[Math.floor(Math.random() * choices.length)];
      await ensureAIUser(aiId);

      const now = Date.now();
      const { error } = await supabase
        .from('reactions')
        .insert([{ post_id: target.id, user_id: aiId, emoji: stampId, created_at: now }]);

      // 入れる直前に人が押すこともある。異常ではないので次の組み合わせへ
      if (error) {
        if (error.message.includes('duplicate')) continue;
        console.error('AI reaction failed:', error.message);
        return false;
      }

      await rememberStamp(aiId, stampId, now);
      return true;
    }
  }

  return false;
}

/**
 * 押したスタンプを住人の持ち物に入れる。
 *
 * 人のときと同じ扱い（app/api/reactions）。
 * ここを飛ばすと住人の持ち物が増えず、既定の6個しか押さないままになる。
 */
async function rememberStamp(userId: string, stampId: string, now: number): Promise<void> {
  try {
    const { data: owned } = await supabase
      .from('user_stamps')
      .select('use_count')
      .eq('user_id', userId)
      .eq('stamp_id', stampId)
      .single();

    if (owned) {
      await supabase
        .from('user_stamps')
        .update({ use_count: (owned.use_count as number) + 1, last_used_at: now })
        .eq('user_id', userId)
        .eq('stamp_id', stampId);
      return;
    }

    await supabase.from('user_stamps').insert([
      { user_id: userId, stamp_id: stampId, acquired_at: now, use_count: 1, last_used_at: now },
    ]);
  } catch (error) {
    // 持ち物に入らなくても、押したこと自体は成立している
    console.error('Failed to remember stamp for AI:', error);
  }
}

/** その場で並びを崩す。元の配列は変えない */
function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** 同じやり取りの中で、AIが答える回数の上限 */
const MAX_CHAIN_ANSWERS = 4;

/** これより古い返信には、いまさら答えない */
const ANSWER_WINDOW = 6 * 3600000;

/**
 * 自分の書き込みに付いた返信へ、本人が答える。
 *
 * 会話が永遠に続かないよう、蓋を四つ。
 *
 *   1. **人からの返信にだけ答える。** AIからの返信には答えない。
 *      ここを開けるとAI同士で無限に続く
 *   2. **1つの返信につき1回だけ。** 既に誰かが答えていれば何もしない
 *   3. **同じやり取りで4回まで。** 親をたどって自分の発言を数える。
 *      人が食い下がっても、どこかで打ち止めになる
 *   4. **6時間より古い返信には答えない。** 返事が来ないまま流れた話を
 *      いまさら掘り返さない
 *
 * 1日の発言数の上限と、板ごとの点検間隔は、これまでどおり効いている。
 */
async function answerPendingReply(
  posts: Post[],
  board: BoardRow,
  config: AIConfig,
  boardId: string,
  now: number,
  state: SpaceState
): Promise<SpeakOutcome | null> {
  const byId = new Map(posts.map((p) => [p.id, p]));

  // 新しい順に並んでいるので、古い返信から順に見るため逆から回す
  for (const reply of [...posts].reverse()) {
    if (reply.author_type !== 'user') continue;
    if (!reply.thread_id) continue;
    if (now - reply.created_at > ANSWER_WINDOW) continue;

    const parent = byId.get(reply.thread_id);
    if (!parent || parent.author_type !== 'ai') continue;

    // 既に誰かが答えている
    if (posts.some((p) => p.thread_id === reply.id)) continue;

    // 同じやり取りで、この住人が何回喋ったか
    let answers = 0;
    let cursor: Post | undefined = parent;
    while (cursor) {
      if (cursor.author_id === parent.author_id) answers++;
      cursor = cursor.thread_id ? byId.get(cursor.thread_id) : undefined;
    }
    if (answers >= MAX_CHAIN_ANSWERS) continue;

    const { data: character } = await supabase
      .from('ai_characters')
      .select('*')
      .eq('id', parent.author_id)
      .single();

    if (!character) continue;

    const systemPrompt = buildResidentPrompt({
      commonPrompt: config.system_prompt,
      characterPrompt: character.system_prompt as string,
      board,
      posts,
      state,
      isReply: true,
      kaomoji: usesKaomoji(parent.author_id) ? sampleKaomoji(5) : [],
    });

    // 答えるだけの回なので、ひと言で済むことも多い（lib/ai-length.ts）
    const lengthPlan = planLength({
      maxResponseLength: config.max_response_length,
      residentId: parent.author_id,
      isReply: true,
    });

    const content = await generateAIResponseWithGPT(
      `${systemPrompt}

これはあなた自身の書き込みへの返信です。` +
        `書いた本人として、相手が言ったことに直接答えてください。` +
        `話を広げず、聞かれたことに答えるだけで充分です。` +
        (answers >= MAX_CHAIN_ANSWERS - 1
          ? `なお、この話はここで一区切りです。次に続けさせる問いかけは書きません。`
          : ''),
      posts,
      reply,
      config.max_response_length,
      config.gpt_temperature,
      config.gpt_presence_penalty,
      config.gpt_frequency_penalty,
      config.gpt_model,
      lengthPlan
    );

    if (!content || !content.trim()) {
      return { boardId, posted: false, reason: 'answer_generation_failed', state };
    }

    const post: Post = {
      id: `ai-${now}-${Math.random().toString(36).slice(2, 8)}`,
      content,
      type: 'text',
      created_at: Date.now(),
      thread_id: reply.id,
      author_type: 'ai',
      author_id: parent.author_id,
      media_url: null,
      board_id: boardId,
    };

    await ensureAIUser(parent.author_id);

    const { error } = await supabase.from('posts').insert([post]);
    if (error) {
      return { boardId, posted: false, reason: `insert_failed: ${error.message}`, state };
    }

    await supabase
      .from('ai_characters')
      .update({ last_post_time: now })
      .eq('id', parent.author_id);
    await supabase.from('board_ai_state').update({ last_ai_post_at: now }).eq('board_id', boardId);

    await supabase.from('logs').insert([
      {
        event_type: 'ai_intervention',
        user_id: parent.author_id,
        post_id: post.id,
        metadata: {
          state,
          content,
          board_id: boardId,
          is_reply: true,
          is_answer: true,
          chain_answers: answers + 1,
          ai_character: character.name,
        },
        created_at: Date.now(),
      },
    ]);

    return {
      boardId,
      posted: true,
      reason: 'answered',
      content,
      aiId: parent.author_id as string,
      state,
    };
  }

  return null;
}

interface BoardRow {
  title: string;
  description: string | null;
  archived: boolean;
  /** 立った時刻。立てた直後は誰も来ない（lib/board-grace.ts） */
  created_at: number | null;
  /** 立てた人。住人が立てた板の一行目は、この人が書く */
  created_by: string | null;
  ai_max_density: number | null;
  ai_interval_active: number | null;
  ai_interval_quiet: number | null;
  ai_probability_scale: number | null;
}

/**
 * 板そのものと、その板だけのAIの設定。
 *
 * 板ごとの列は migration-009 で入る。未適用のDBでは列が無いので、
 * その場合は板の基本情報だけ読み直して、設定は空（＝場の設定に従う）とする。
 */
async function loadBoard(boardId: string): Promise<BoardRow> {
  const { data, error } = await supabase
    .from('boards')
    .select(
      'title, description, archived, created_at, created_by, ai_max_density, ai_interval_active, ai_interval_quiet, ai_probability_scale'
    )
    .eq('id', boardId)
    .single();

  if (!error && data) return data as BoardRow;

  const { data: basic } = await supabase
    .from('boards')
    .select('title, description, archived, created_at, created_by')
    .eq('id', boardId)
    .single();

  return {
    title: (basic?.title as string) ?? '',
    description: (basic?.description as string) ?? null,
    archived: Boolean(basic?.archived),
    created_at: (basic?.created_at as number) ?? null,
    created_by: (basic?.created_by as string) ?? null,
    ai_max_density: null,
    ai_interval_active: null,
    ai_interval_quiet: null,
    ai_probability_scale: null,
  };
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
