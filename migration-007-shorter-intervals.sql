-- まざりば 第7次マイグレーション
-- 板を見にいく間隔を短くする。
-- 何度実行しても同じ結果になります（冪等）。
--
-- 背景:
--   migration-004 の既定（動いている板10分／止まっている板3時間）は慎重すぎた。
--   止まっている板は3時間に一度しか抽選されず、その抽選も35%で外れるので、
--   実際に書き込まれるのは平均8時間に1回になる。「誰も喋らない」と見える。
--
--   回数の上限（ai_daily_budget）で費用は止まるので、間隔のほうは短くしてよい。
--   間隔は「どれだけ細かく様子を見るか」、上限は「1日に何回まで書くか」で、
--   費用を決めているのは後者。

ALTER TABLE ai_settings ALTER COLUMN ai_board_interval_active SET DEFAULT 300000;
ALTER TABLE ai_settings ALTER COLUMN ai_board_interval_quiet SET DEFAULT 1800000;

-- 既定値のままの行だけ入れ替える（管理画面で調整済みの値は触らない）
UPDATE ai_settings SET ai_board_interval_active = 300000 WHERE ai_board_interval_active = 600000;
UPDATE ai_settings SET ai_board_interval_quiet = 1800000 WHERE ai_board_interval_quiet = 10800000;

-- 様子を見る予定が先に入っている板は、いますぐ見られるように戻す
UPDATE board_ai_state SET next_due_at = 0 WHERE next_due_at > (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;

-- 処理中のまま残っている目印も外す（デプロイ中に落ちた場合など）
UPDATE board_ai_state SET lease_until = 0 WHERE lease_until > 0;
