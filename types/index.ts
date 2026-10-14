// 板（2ちゃんねるでいう「板」）の型定義
export interface Board {
  id: string;
  title: string;
  description: string | null;
  created_at: number;
  created_by: string | null;
  is_default: boolean;
  archived: boolean;
}

// 板一覧に出す集計情報つきの板
export interface BoardSummary extends Board {
  thread_count: number;
  post_count: number;
  last_post_at: number | null;
  participants: Participant[];
}

// 板の参加者（人もAIも）
export interface Participant {
  id: string;
  type: 'user' | 'ai';
  name: string;
  post_count: number;
}

// 投稿の型定義
export interface Post {
  id: string;
  content: string;
  type: 'text' | 'voice' | 'image';
  created_at: number;
  thread_id: string | null;
  author_type: 'user' | 'ai';
  author_id: string;
  media_url: string | null;
  board_id: string | null;
}

// ログの型定義
export interface Log {
  id: string;
  event_type: 'post' | 'view' | 'reply' | 'ai_intervention';
  user_id: string;
  post_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: number;
}

// 空間状態の型定義
export type SpaceState = 'FLOW' | 'SILENCE' | 'FRAGILE' | 'SOLO';

// 場の状態の日本語ラベル（画面表示用）
// 誰が書くかには触れない。人かAIかを画面から推測させないため。
export const SPACE_STATE_LABEL: Record<SpaceState, { name: string; hint: string }> = {
  FLOW: { name: 'にぎやか', hint: '会話が流れている。新しい話題は入りにくい' },
  SILENCE: { name: 'しずか', hint: '止まっている。誰かが話題を出しやすい' },
  FRAGILE: { name: 'ゆらぎ', hint: 'どちらにも転ぶ場面' },
  SOLO: { name: 'ひとりごと', hint: '返事がないまま置かれている' },
};

// 場の状態（画面に出す値。算出はAIの判定と同じ）
export interface AIMood {
  state: SpaceState;
  probability: number;
  density: number;
  max_density: number;
  ai_count: number;
  eligible_count: number;
  cooldown_remaining: number;
  blocked_reason: string | null;
}

// AI介入確率
export const AI_INTERVENTION_PROBABILITY: Record<SpaceState, number> = {
  FLOW: 0,
  SILENCE: 0.35,
  FRAGILE: 0.15,
  SOLO: 0.5,
};

// ユーザーカラー（17色）
export const USER_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52B788',
  '#E63946', '#A8DADC', '#F4A261', '#2A9D8F', '#E76F51',
  '#8338EC', '#FB5607',
];
