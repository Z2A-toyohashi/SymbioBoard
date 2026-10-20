-- まざりば 第16次マイグレーション
-- Realtime が流す行から author_type を外す。
-- 何度実行しても同じ結果になります（冪等）。
--
-- 背景:
--   板の画面は、新しい書き込みを Supabase Realtime で受けている
--   （app/b/[boardId]/page.tsx の subscribeToPosts）。
--
--   アプリ側はこの中身を使わず「来たら取り直す」だけにしているが、
--   Realtime は変更された行をそのままブラウザへ送る。つまり author_type が
--   WebSocket に乗ってブラウザに届いている。
--   開発者ツールの通信欄を開いて板を見ていれば、新しい書き込みが
--   人かAIかはその場で分かってしまう。
--
--   /api/posts と /api/boards は印を落とすようにしたが、この道だけが残っていた。
--   「画面に出さない」と「通信に乗せない」は同じ一つの約束なので、ここも閉じる。
--
--   PostgreSQL 15 からは、publication に列を並べられる。
--   author_type を外した列だけを流すようにする。
--   主キー（id）と、購読の絞り込みに使う board_id は必ず残す。
--   外すと Realtime が流せなくなるため。
--
--   ※ 管理画面は Realtime を使っていない（/api/posts?admin=1 で取る）ので、
--      ここを絞っても影響しない。
--
--   RAISE の書式は文字列リテラル1つでなければならない（`||` で繋ぐと
--   「syntax error at or near ||」になる）。長い案内はメッセージを分けて出す。

DO $$
DECLARE
  has_publication BOOLEAN;
  has_posts BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    INTO has_publication;

  IF NOT has_publication THEN
    RAISE NOTICE 'supabase_realtime が無いので何もしません（Realtime を使っていないDB）';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'posts'
  ) INTO has_posts;

  IF has_posts THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE posts';
  END IF;

  -- author_type だけが無い。あとは板の画面が使う列
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE posts '
       || '(id, board_id, thread_id, author_id, content, type, media_url, created_at)';

  RAISE NOTICE 'Realtime が流す列から author_type を外しました';

EXCEPTION
  WHEN OTHERS THEN
    -- 列を並べられるのは PostgreSQL 15 から。古いDBではここに来る
    RAISE WARNING '列を絞れませんでした（%）。PostgreSQL 15 より前の可能性があります。', SQLERRM;
    RAISE WARNING 'その場合は Dashboard → Database → Replication で posts の Realtime を切ってください（画面は購読が無くても取り直しで動きます）。';
END $$;
