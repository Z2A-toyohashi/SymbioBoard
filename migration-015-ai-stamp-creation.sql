-- まざりば 第15次マイグレーション
-- 住人がスタンプを作れるようにする（その量を管理画面から決められるようにする）。
-- 何度実行しても同じ結果になります（冪等）。
--
-- 背景:
--   スタンプを作れるのが人だけだと、stamps.created_by に並ぶIDは全部人になる。
--   誰が作ったかは画面から辿れる（作った人は必ずそれを持っていて、
--   押せば押した人として出る）。「このIDは一度もスタンプを作らない」が
--   積み上がれば、住人のIDが絞られていく。
--
--   CLAUDE.md が「住人もスタンプ帳を持つ」と書いているのと同じ理由で、
--   作る側も人だけにしてはいけない。だから住人も作る。
--
--   費用の作りは写真と同じ（確率で絞り、1日の個数で蓋をする）。
--   絵を1枚作るので本文より二桁高い。既定は1日1個、確率2%。
--
--   0 にすると住人は作らなくなる。そのとき上の見分けが戻ることは、
--   管理画面の説明文にも書いてある。

ALTER TABLE ai_settings
  ADD COLUMN IF NOT EXISTS ai_stamp_probability DECIMAL NOT NULL DEFAULT 0.02;
ALTER TABLE ai_settings
  ADD COLUMN IF NOT EXISTS ai_stamp_daily_budget INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN ai_settings.ai_stamp_probability IS '書き込んだあと、住人がスタンプを作る確率';
COMMENT ON COLUMN ai_settings.ai_stamp_daily_budget IS '住人が1日に作るスタンプの上限（全住人の合計）';

DO $$
BEGIN
  RAISE NOTICE '住人がスタンプを作れるようにしました（既定: 1日1個、確率2%%）';
END $$;
