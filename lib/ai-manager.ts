import { supabase } from './supabase-client';

interface AICharacter {
  id: string;
  name: string;
  personality: string;
  system_prompt: string;
  created_at: number;
}

// アクティブなAIキャラクターのキャッシュ
let activeAICharacters: AICharacter[] = [];
let lastUpdate = 0;
const CACHE_DURATION = 60000; // 1分

/**
 * 現在のユーザー数に応じてAIキャラクターを取得
 */
export async function getActiveAICharacters(userCount: number): Promise<AICharacter[]> {
  const now = Date.now();
  
  // キャッシュが有効な場合は再利用
  if (activeAICharacters.length > 0 && now - lastUpdate < CACHE_DURATION) {
    return activeAICharacters.slice(0, Math.max(1, Math.floor(userCount * 0.5)));
  }

  try {
    const { data, error } = await supabase
      .from('ai_characters')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;

    activeAICharacters = data || [];
    lastUpdate = now;

    // ユーザー数の50%程度のAIを返す（最低1人）
    const aiCount = Math.max(1, Math.floor(userCount * 0.5));
    return activeAICharacters.slice(0, aiCount);
  } catch (error) {
    console.error('Failed to fetch AI characters:', error);
    return [];
  }
}

/**
 * ランダムにAIキャラクターを1人選択
 */
export async function selectRandomAICharacter(userCount: number): Promise<AICharacter | null> {
  const characters = await getActiveAICharacters(userCount);
  if (characters.length === 0) return null;
  
  return characters[Math.floor(Math.random() * characters.length)];
}

/**
 * 特定のAIキャラクターを取得
 */
export async function getAICharacter(aiId: string): Promise<AICharacter | null> {
  try {
    const { data, error } = await supabase
      .from('ai_characters')
      .select('*')
      .eq('id', aiId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Failed to fetch AI character:', error);
    return null;
  }
}

/**
 * 住人がスタンプを押すかどうか。
 *
 * 書き込みと違って生成を伴わないので、押しても費用はかからない。
 * それなのに確率を低く置いていたため、板に押された跡がほとんど残らず、
 * 書いたものが読まれているのかどうかが分からない画面になっていた。
 *
 * スタンプは「返事をするほどではないが、見た」という合図で、
 * 掲示板で一番軽いやり取りなので、本来いちばん多く起きていい。
 * 止まっている板ほど押しやすくする（誰かが見ていることだけが伝わる）。
 */
export function shouldAIReact(spaceState: string): boolean {
  const probabilities: Record<string, number> = {
    FLOW: 0.35,
    SILENCE: 0.6,
    FRAGILE: 0.5,
    SOLO: 0.7,
  };

  return Math.random() < (probabilities[spaceState] ?? 0.45);
}

/**
 * 押せるスタンプ。
 * 画面側（components/PostItem.tsx）の並びと同じものを使う。
 * あちらは画面用のファイルなので、ここを読むとデータベースの接続まで
 * 画面側に持ち込むことになる。そのため、同じ並びを両方に置いている。
 */
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '🤔', '👀'];
