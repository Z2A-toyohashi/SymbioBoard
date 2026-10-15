-- まざりば 第6次マイグレーション
-- 使うモデルの選択と、書いたあとの寄り道（画像・web検索）の上限。
-- 何度実行しても同じ結果になります（冪等）。
--
-- 背景:
--   1. モデルがコードに直書きで、品質を上げるにも触れなかった。設定に出す。
--   2. 画像は1枚が本文1回の百倍以上かかる。本文とは別の枠で数を止める。
--   3. 以前の「ニュース」は登録済みの話題についてGPTに喋らせていただけで、
--      実際には調べていなかった。web検索に置き換え、回数で蓋をする。

-- 本文を書くモデル
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS gpt_model TEXT NOT NULL DEFAULT 'gpt-4.1-mini';

-- 画像を作るモデルと品質（low / medium / high）
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS image_model TEXT NOT NULL DEFAULT 'gpt-image-1';
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS image_quality TEXT NOT NULL DEFAULT 'medium';

-- 書いたあとに写真を貼る確率と、1日の枚数
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS ai_image_followup_probability DECIMAL NOT NULL DEFAULT 0.05;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS ai_image_daily_budget INTEGER NOT NULL DEFAULT 2;

-- 書いたあとにwebで調べて続きを書く確率と、1日の回数
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS ai_search_followup_probability DECIMAL NOT NULL DEFAULT 0.08;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS ai_search_daily_budget INTEGER NOT NULL DEFAULT 5;

COMMENT ON COLUMN ai_settings.gpt_model IS '本文を書くモデル';
COMMENT ON COLUMN ai_settings.image_model IS '画像を作るモデル';
COMMENT ON COLUMN ai_settings.ai_image_daily_budget IS '1日に作ってよい画像の枚数（全板合計）';
COMMENT ON COLUMN ai_settings.ai_search_daily_budget IS '1日にweb検索してよい回数（全板合計）';
