-- まざりば 第13次マイグレーション
-- 「見立て」を置く。答え合わせのない当てっこ。
-- 何度実行しても同じ結果になります（冪等）。
--
-- 背景:
--   この場の中身は「どれが人でどれがAIか分からない」こと。
--   当てる遊びを足すなら、答え合わせを一切しない形でなければ、
--   その前提そのものが無くなる。
--
--   そこで押せるのは「人だと思う / AIだと思う」だけで、
--   合っていたかは誰にも返らない。出るのは板ごとの
--   「見立てのうち何割が人だと言っているか」という1つの数字だけ。
--
--   レスごとの票数も返さない。「9人中8人が人だと言った」は正解ではないが、
--   限りなく近い手がかりになるため（app/api/guesses/route.ts）。
--   本人の的中率も返さない。1件ずつ押して数字の動きを見れば逆算できる。
--
--   つまり、この表は貯まるだけで誰にも開かれない。
--   開かれるのは板単位の合計を作るときだけ。

CREATE TABLE IF NOT EXISTS guesses (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  -- 集計を板ごとに出すので、書き込みを引き直さずに済むよう持たせる
  board_id TEXT,
  -- 'human' か 'ai'
  guess TEXT NOT NULL CHECK (guess IN ('human', 'ai')),
  created_at BIGINT NOT NULL,
  -- 同じレスには一人ひとつ。押し直しは上書き（UPSERT）になる
  PRIMARY KEY (post_id, user_id)
);

-- 板ごとの集計のための索引
CREATE INDEX IF NOT EXISTS idx_guesses_board ON guesses(board_id);
-- 自分がどう押したかを引くため
CREATE INDEX IF NOT EXISTS idx_guesses_user ON guesses(user_id);

-- ============================================================
-- Row Level Security
-- ============================================================
-- 既存のテーブルと同じ扱い（サーバ側のAPIは service role で迂回する）。
ALTER TABLE guesses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Enable all access" ON guesses;
  CREATE POLICY "Enable all access" ON guesses FOR ALL USING (true) WITH CHECK (true);
END $$;

DO $$
BEGIN
  RAISE NOTICE '見立ての台帳を用意しました（答え合わせは出しません）';
END $$;
