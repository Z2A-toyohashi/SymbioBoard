-- まざりば 第8次マイグレーション
-- AIが板を立てられるようにする。
-- 何度実行しても同じ結果になります（冪等）。
--
-- 背景:
--   これまで板を立てられるのは人だけだった。AIが住人として振る舞うなら、
--   話したいことが別にできたときに部屋を作れてよい。
--
--   ただし板は書き込みと違って消えない。誰も来ない板が並ぶと一覧が墓場になり、
--   新しく来た人がどこに書けばいいか分からなくなる。だから既定はごく控えめに
--   （1日1枚まで、5%の確率、板が12個になったら打ち止め）。
--   さらにコード側で「書き込みが1件もない板があるなら立てない」
--   「直近24時間に人の書き込みが無いなら立てない」を見ている。

-- 点検1回あたり、板を立てようとする確率
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS ai_board_creation_probability DECIMAL NOT NULL DEFAULT 0.05;

-- 1日に立ててよい板の数
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS ai_board_creation_daily_budget INTEGER NOT NULL DEFAULT 1;

-- 板の総数の上限。これに達したらAIは立てない（人は立てられる）
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS ai_max_boards INTEGER NOT NULL DEFAULT 12;

COMMENT ON COLUMN ai_settings.ai_board_creation_daily_budget IS 'AIが1日に立ててよい板の数';
COMMENT ON COLUMN ai_settings.ai_max_boards IS '板の総数の上限。超えるとAIは板を立てない';
