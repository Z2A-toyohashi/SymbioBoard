-- まざりば 第9次マイグレーション
-- 板ごとにAIの出方を変えられるようにする。
-- 何度実行しても同じ結果になります（冪等）。
--
-- 背景:
--   AIの密度も点検間隔も、これまで全板で共通の1組しか持てなかった。
--   板は性格が違う。人がよく書く板ではAIは控えめでよく、
--   立てたばかりで誰もいない板ではもっと出てきてほしい。
--   それを1つの数字で決めると、どちらかが必ず破綻する。
--
--   各列は NULL のままなら「場の設定（ai_settings）に従う」。
--   触った板だけが、その板の数字で動く。

-- その板でAIが占めてよい割合（直近20件で見る）。NULL なら全体設定
ALTER TABLE boards ADD COLUMN IF NOT EXISTS ai_max_density DECIMAL;

-- 書き込みが続いている時の点検間隔（ミリ秒）。NULL なら全体設定
ALTER TABLE boards ADD COLUMN IF NOT EXISTS ai_interval_active INTEGER;

-- 止まっている時の点検間隔（ミリ秒）。NULL なら全体設定
ALTER TABLE boards ADD COLUMN IF NOT EXISTS ai_interval_quiet INTEGER;

-- 発言しやすさの倍率。1.0 で全体設定どおり、2.0 で2倍出てくる。NULL なら 1.0
ALTER TABLE boards ADD COLUMN IF NOT EXISTS ai_probability_scale DECIMAL;

COMMENT ON COLUMN boards.ai_max_density IS 'この板でAIが占めてよい割合。NULLなら ai_settings に従う';
COMMENT ON COLUMN boards.ai_probability_scale IS '発言確率の倍率。1.0で全体設定どおり';
