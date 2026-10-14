-- まざりば 第2次マイグレーション
-- schema-all.sql を実行済みのDBに追加で流してください。
-- 何度実行しても同じ結果になります（冪等）。
--
-- 追加するもの:
--   1. boards            … 2ちゃんねる的な「板」
--   2. posts.board_id    … 投稿がどの板に属するか
--   3. users.handover_code … 別ブラウザへ本人を引き継ぐためのコード
--   4. ai_settings の AI自動増員まわりの設定
--   5. 既定の板「雑談」と、既存投稿の退避

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
