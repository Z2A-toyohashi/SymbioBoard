-- まざりば 第12次マイグレーション
-- 人の行動の記録を、分析に使える形にする。
-- 何度実行しても同じ結果になります（冪等）。
--
-- 背景:
--   logs に入っていたのは「書き込んだ」と「住人が喋った」だけだった。
--   知りたいのは書かれた結果ではなく、そこに至るまでの動き
--   （どの板を開いて、どれだけ読んで、何を押して、何も書かずに帰ったか）。
--   書き込みの記録だけを見ていると、一度も書かなかった人が存在しないことになる。
--
--   新しい行動（読んだ・押した・見立てた・板を移った）は
--   app/api/activity が同じ logs に入れる。テーブルを増やさないのは、
--   ひとりの動きを時刻順に並べたいのに、置き場所が分かれていると並べられないため。
--
--   ここで直すのは2つ。
--
--   1. post_id の外部キー。
--      いまは ON DELETE CASCADE なので、書き込みが消えると
--      その書き込みに関する過去の行動まで一緒に消える。
--      分析のための記録が、消された書き込みごと消えてしまうのは困る。
--      SET NULL に変えて、記録は残して指し先だけ外す。
--
--   2. 索引。
--      「このIDの動きを時刻順に」「この板の動きを」という読み方をするので、
--      その2つに索引を足す。板は metadata の中にあるので式索引になる。

-- ============================================================
-- 1. 書き込みが消えても記録は残す
-- ============================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'logs'::regclass
      AND contype = 'f'
      AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (post_id)%'
  LOOP
    EXECUTE format('ALTER TABLE logs DROP CONSTRAINT %I', r.conname);
  END LOOP;

  ALTER TABLE logs
    ADD CONSTRAINT logs_post_id_fkey
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL;
END $$;

-- ============================================================
-- 2. 読み方に合わせた索引
-- ============================================================
-- ひとりの動きを時刻順に追う
CREATE INDEX IF NOT EXISTS idx_logs_user_created ON logs(user_id, created_at DESC);

-- 板ごとに追う。板は metadata->>'board_id' に入れている
CREATE INDEX IF NOT EXISTS idx_logs_board ON logs((metadata->>'board_id'));

DO $$
BEGIN
  RAISE NOTICE '行動の記録を分析に使える形にしました';
END $$;
