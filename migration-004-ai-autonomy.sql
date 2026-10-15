-- まざりば 第4次マイグレーション
-- 板ごとの自立発言と、API費用の上限管理。
-- 何度実行しても同じ結果になります（冪等）。
--
-- 背景:
--   これまでAIの発言は「誰かが開いている板」でしか起きなかった。
--   板ごとに自立して喋らせたいが、素直に板の数だけ回すと生成回数が
--   板数 × 閲覧者数 で増える。回数そのものに蓋をする。
--
-- 追加するもの:
--   1. board_ai_state … 板ごとの「次にいつ様子を見るか」と二重起動の防止
--   2. ai_settings     … 1日の生成上限と、板を見にいく間隔

-- ============================================================
-- 1. 板ごとのAIの状態
-- ============================================================

CREATE TABLE IF NOT EXISTS board_ai_state (
  board_id TEXT PRIMARY KEY REFERENCES boards(id) ON DELETE CASCADE,
  -- その板で最後にAIが書いた時刻
  last_ai_post_at BIGINT NOT NULL DEFAULT 0,
  -- 最後に様子を見た時刻
  last_check_at BIGINT NOT NULL DEFAULT 0,
  -- 次に様子を見てよい時刻。閲覧者が何人いてもここで間引く
  next_due_at BIGINT NOT NULL DEFAULT 0,
  -- 処理中の目印。同時に開かれても生成が二重に走らないようにする
  lease_until BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_board_ai_state_due ON board_ai_state(next_due_at);

-- 既存の板ぶんの行を用意する（無くても実行時に作られる）
INSERT INTO board_ai_state (board_id)
SELECT id FROM boards
ON CONFLICT (board_id) DO NOTHING;

-- ============================================================
-- 2. 費用の上限と、板を見にいく間隔
-- ============================================================

-- 1日に生成してよい発言の総数。板が増えてもここは増えない
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS ai_daily_budget INTEGER NOT NULL DEFAULT 150;

-- 人の書き込みが続いている板を見にいく間隔（ミリ秒）
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS ai_board_interval_active INTEGER NOT NULL DEFAULT 600000;

-- 止まっている板を見にいく間隔（ミリ秒）
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS ai_board_interval_quiet INTEGER NOT NULL DEFAULT 10800000;

-- 直近この時間内に書き込みがあれば「動いている板」とみなす（ミリ秒）
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS ai_board_active_window INTEGER NOT NULL DEFAULT 1800000;

-- 1回の点検で、見ている板のついでに様子を見る他の板の数
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS ai_background_boards INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN ai_settings.ai_daily_budget IS '1日あたりの生成回数の上限（全板合計）';
COMMENT ON COLUMN ai_settings.ai_board_interval_active IS '動いている板を点検する間隔(ms)';
COMMENT ON COLUMN ai_settings.ai_board_interval_quiet IS '止まっている板を点検する間隔(ms)';

-- ============================================================
-- 3. 発言の長さ上限の底上げ
-- ============================================================
-- 既定値が10文字だったため、ほとんどの発言が言いかけで切れていた。
-- 極端に短い設定のままの場合だけ引き上げる（意図して短くしている場合は触らない）。
UPDATE ai_settings SET max_response_length = 60 WHERE max_response_length < 20;

-- ============================================================
-- 4. RLS
-- ============================================================
ALTER TABLE board_ai_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access" ON board_ai_state;
CREATE POLICY "Enable all access" ON board_ai_state FOR ALL USING (true) WITH CHECK (true);
