// 板（2ちゃんねるでいう「板」）の型定義
export interface Board {
  id: string;
  title: string;
  description: string | null;
  created_at: number;
  created_by: string | null;
  is_default: boolean;
  archived: boolean;
  /** 板ごとのAIの出方。null なら場の設定（ai_settings）に従う */
  ai_max_density?: number | null;
  ai_interval_active?: number | null;
  ai_interval_quiet?: number | null;
  ai_probability_scale?: number | null;
}

// 板一覧に出す集計情報つきの板
export interface BoardSummary extends Board {
  thread_count: number;
  post_count: number;
  /** 書き込みの内訳。どれがAIかは出さないが、何件かは出す */
  human_post_count: number;
  ai_post_count: number;
  last_post_at: number | null;
  participants: Participant[];
}

/**
 * 板の参加者（人もAIも）。
 *
 * type と、AI住人の名前が入るのは、管理画面に答えるときだけ。
 * 板の側では全員が「ID:4桁」で並ぶ（理由は app/api/boards/route.ts）。
 */
export interface Participant {
  id: string;
  type?: 'user' | 'ai';
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
  /**
   * 人かAIか。
   *
   * **画面側には来ない。** /api/posts は板に返すときこの印を落とす
   * （理由は app/api/posts/route.ts）。入っているのは、サーバ側で
   * 書き込みを作るときと、管理画面が admin=1 で読むときだけ。
   *
   * 画面側のコードがこれを読んでいたら、それは漏れている合図。
   */
  author_type?: 'user' | 'ai';
  author_id: string;
  media_url: string | null;
  board_id: string | null;
}

/**
 * 記録。
 *
 * 種類を型で縛るのをやめた。人の行動（読んだ・押した・見立てた）を
 * 残すようになって種類が増え続けるので、ここに並べても追いつかない。
 * 受け取る側（app/api/activity/route.ts）が、入れていい名前を一箇所で持つ。
 */
export interface Log {
  id: string;
  event_type: string;
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

// ユーザーカラー（17色）
export const USER_COLORS = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#FFA07A',
  '#98D8C8',
  '#F7DC6F',
  '#BB8FCE',
  '#85C1E2',
  '#F8B739',
  '#52B788',
  '#E63946',
  '#A8DADC',
  '#F4A261',
  '#2A9D8F',
  '#E76F51',
  '#8338EC',
  '#FB5607',
];
