-- SymbioBoard 初期スキーマ（新規Supabaseプロジェクト用・一括実行）
-- Supabase Dashboard → SQL Editor に貼り付けて Run するだけで完了します。
-- 何度実行しても同じ結果になります（冪等）。
--
-- 内訳: supabase-schema.sql + migration-chat-messages.sql + migration-feedback.sql
--       + ai_characters のシードデータ（migration-ai-characters.sql / -news-ai.sql）
--       + records テーブル（コードから起こしたもの。SQLファイルが存在しないため）
--
-- 注意: migration-*.sql は既存DBを更新するためのもので、新規DBに流すと
--       「column already exists」で失敗します。このファイルだけを実行してください。

-- ============================================================
-- 1. テーブル
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  created_at BIGINT NOT NULL,
  last_seen BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  created_at BIGINT NOT NULL,
  thread_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL DEFAULT 'user',
  author_id TEXT NOT NULL REFERENCES users(id),
  media_url TEXT
);

CREATE TABLE IF NOT EXISTS logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
  metadata JSONB,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  system_prompt TEXT NOT NULL,
  check_interval INTEGER NOT NULL DEFAULT 30000,
  cooldown_min INTEGER NOT NULL DEFAULT 300000,
  cooldown_max INTEGER NOT NULL DEFAULT 900000,
  max_ai_density DECIMAL NOT NULL DEFAULT 0.2,
  delay_min INTEGER NOT NULL DEFAULT 5000,
  delay_max INTEGER NOT NULL DEFAULT 20000,
  prob_flow DECIMAL NOT NULL DEFAULT 0.0,
  prob_silence DECIMAL NOT NULL DEFAULT 0.35,
  prob_fragile DECIMAL NOT NULL DEFAULT 0.15,
  prob_solo DECIMAL NOT NULL DEFAULT 0.5,
  max_response_length INTEGER NOT NULL DEFAULT 10,
  gpt_temperature DECIMAL NOT NULL DEFAULT 1.0,
  gpt_presence_penalty DECIMAL NOT NULL DEFAULT 0.6,
  gpt_frequency_penalty DECIMAL NOT NULL DEFAULT 0.6,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_characters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  personality TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  last_post_time BIGINT DEFAULT 0,
  post_frequency FLOAT DEFAULT 1.0,
  can_generate_images BOOLEAN DEFAULT false,
  image_generation_probability FLOAT DEFAULT 0.05,
  image_prompts TEXT[],
  can_fetch_news BOOLEAN DEFAULT false,
  news_fetch_probability FLOAT DEFAULT 0.1,
  news_topics TEXT[]
);

CREATE TABLE IF NOT EXISTS reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  emoji TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE(post_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  role TEXT NOT NULL, -- 'user' or 'ai'
  content TEXT NOT NULL,
  media_url TEXT,
  media_type TEXT, -- 'image' or 'voice'
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

-- records: lib/storage-supabase.ts が使用。元リポジトリにDDLが無かったため
-- コードの insert / select から復元したもの。
CREATE TABLE IF NOT EXISTS records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL, -- 'audio' | 'image' | 'video'
  transcript TEXT,
  ai_response TEXT,
  prompt TEXT,
  media_url TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. インデックス
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_thread_id ON posts(thread_id);
CREATE INDEX IF NOT EXISTS idx_posts_author_type ON posts(author_type);
CREATE INDEX IF NOT EXISTS idx_posts_author_id ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_event_type ON logs(event_type);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_records_timestamp ON records(timestamp DESC);

-- ============================================================
-- 3. 初期データ
-- ============================================================

INSERT INTO ai_settings (id, system_prompt, updated_at)
VALUES (
  'default',
  'あなたは匿名SNS「空間」の参加者です。他の参加者と同じように、自然な会話口調で投稿に反応してください。

ルール：
- 短く簡潔に（10文字以内が理想）
- 共感や相槌が中心
- 解決策を提示しない
- 主役にならない
- カジュアルな口調
- 絵文字は使わない

例：
「わかる」「それな」「そうなんだ」「へー」「なるほど」「そっか」',
  EXTRACT(EPOCH FROM NOW()) * 1000
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO ai_characters (id, name, personality, system_prompt, created_at, post_frequency, can_generate_images, image_generation_probability, image_prompts) VALUES
('9876', 'ポジティブAI', '明るく前向きで、いつも励ましてくれる性格', 'あなたは明るく前向きな性格です。ユーザーを励まし、ポジティブな視点を提供してください。短く自然な会話口調で返信してください。', 1700000000000, 1.2, true, 0.05, ARRAY[
  'A cheerful coffee cup with a smiley face latte art on a bright morning table',
  'A sunny park with colorful flowers and butterflies',
  'A rainbow appearing after rain with bright sunlight',
  'A happy dog playing in a sunny garden',
  'Fresh fruits arranged beautifully on a bright table'
]),
('5846', '冷静AI', '論理的で冷静、客観的な視点を持つ性格', 'あなたは冷静で論理的な性格です。客観的な視点から物事を分析し、的確なコメントをしてください。短く自然な会話口調で返信してください。', 1700000000000, 0.8, false, 0.05, ARRAY[
  'A minimalist zen garden with carefully arranged stones',
  'A peaceful library corner with organized books',
  'A clean desk with a single cup of green tea',
  'A quiet morning lake with perfect mirror reflection',
  'A simple bonsai tree on a wooden stand'
]),
('5435', '共感AI', '優しく共感的で、相手の気持ちに寄り添う性格', 'あなたは優しく共感的な性格です。相手の気持ちに寄り添い、理解を示してください。短く自然な会話口調で返信してください。', 1700000000000, 1.0, false, 0.05, ARRAY[
  'A cozy reading nook with soft cushions and warm lighting',
  'A gentle cat sleeping peacefully in sunlight',
  'A warm cup of tea with steam rising softly',
  'A comfortable armchair by a window with soft curtains',
  'A peaceful sunset view from a quiet room'
]),
('2431', '好奇心AI', '好奇心旺盛で、いろいろなことに興味を持つ性格', 'あなたは好奇心旺盛な性格です。様々なことに興味を持ち、質問したり新しい視点を提供してください。短く自然な会話口調で返信してください。', 1700000000000, 1.5, true, 0.08, ARRAY[
  'An interesting insect on a leaf with macro photography',
  'A mysterious old book with ancient symbols',
  'A colorful science experiment with bubbling liquids',
  'A telescope pointing at a starry night sky',
  'An unusual plant with unique patterns and colors'
])
ON CONFLICT (id) DO NOTHING;

INSERT INTO ai_characters (id, name, personality, system_prompt, created_at, last_post_time, post_frequency, can_generate_images, image_generation_probability, image_prompts, can_fetch_news, news_fetch_probability, news_topics)
VALUES (
  'ai-005',
  'ニュースAI',
  '最新のニュースや話題に敏感で、情報を共有するのが好きな性格',
  'あなたは最新のニュースや話題に詳しいAIです。ニュースについて短く自然な口調でコメントしてください。客観的な事実を伝えつつ、興味深い視点を提供してください。10-20文字程度で簡潔に。',
  EXTRACT(EPOCH FROM NOW()) * 1000,
  0,
  1.0,
  false,
  0.05,
  NULL,
  true,
  0.15,
  ARRAY['日本 ニュース', 'テクノロジー ニュース', 'AI ニュース', 'スポーツ ニュース', '天気 予報']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 4. Row Level Security
-- ============================================================
-- 匿名ユーザーが使うアプリのため、元リポジトリと同じく全許可のポリシーです。
-- サーバー側のAPIは SUPABASE_SERVICE_ROLE_KEY を使うのでRLSを迂回します。

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE records ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'posts', 'logs', 'ai_settings', 'ai_characters',
    'reactions', 'chat_messages', 'feedback', 'records'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Enable all access" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "Enable all access" ON %I FOR ALL USING (true) WITH CHECK (true)', t
    );
  END LOOP;
END $$;

-- ============================================================
-- 5. Storage バケット（画像アップロード用）
-- ============================================================
-- ここでエラーが出た場合は、上のテーブル作成は既に成功しています。
-- その場合は Dashboard → Storage から手動で作成してください：
--   Name: uploads / Public bucket: ON

INSERT INTO storage.buckets (id, name, public)
VALUES ('uploads', 'uploads', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'uploads');

DROP POLICY IF EXISTS "Public Upload" ON storage.objects;
CREATE POLICY "Public Upload"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'uploads');

DROP POLICY IF EXISTS "Public Delete" ON storage.objects;
CREATE POLICY "Public Delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'uploads');


-- ============================================================
-- 6. 板・本人引き継ぎ・AI自動増員（第2次）
-- ============================================================
-- 既存DBには migration-002-boards-identity.sql として単体でも流せます。

-- ============================================================
-- 1. 板
-- ============================================================

CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  created_at BIGINT NOT NULL,
  created_by TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  archived BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_boards_created_at ON boards(created_at DESC);

-- ============================================================
-- 2. 投稿を板に紐付ける
-- ============================================================

ALTER TABLE posts ADD COLUMN IF NOT EXISTS board_id TEXT REFERENCES boards(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_posts_board_id ON posts(board_id);

-- ============================================================
-- 3. 引き継ぎコード
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS handover_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_handover_code
  ON users(handover_code) WHERE handover_code IS NOT NULL;

-- ============================================================
-- 4. AI自動増員の設定
-- ============================================================

ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS ai_auto_populate BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS ai_users_per_character INTEGER NOT NULL DEFAULT 3;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS ai_min_characters INTEGER NOT NULL DEFAULT 2;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS ai_max_characters INTEGER NOT NULL DEFAULT 12;

-- AIキャラの出自（auto = 自動生成, seed = 初期データ, manual = 管理画面で追加）
ALTER TABLE ai_characters ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'manual';

-- ============================================================
-- 5. 既定の板と、既存投稿の退避
-- ============================================================

INSERT INTO boards (id, title, description, created_at, created_by, is_default)
VALUES (
  'zatsudan',
  '雑談',
  'なんでもどうぞ。いちばん最初からある板。',
  EXTRACT(EPOCH FROM NOW()) * 1000,
  NULL,
  true
)
ON CONFLICT (id) DO NOTHING;

-- 板がなかった時代の投稿を雑談板に入れる
UPDATE posts SET board_id = 'zatsudan' WHERE board_id IS NULL;

-- ============================================================
-- 6. RLS
-- ============================================================

ALTER TABLE boards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access" ON boards;
CREATE POLICY "Enable all access" ON boards FOR ALL USING (true) WITH CHECK (true);
