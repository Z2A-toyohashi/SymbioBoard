-- まざりば 第5次マイグレーション
-- AI住人のIDを4桁の数字に統一する。
-- 何度実行しても同じ結果になります（冪等。既に4桁の数字のIDは触りません）。
--
-- 背景:
--   板に出るのはIDの末尾4桁だけ。人は8桁の英数字なので末尾もばらばらだが、
--   自動生成されたAIは `auto-mgx1-3f`、手動追加は `manual-mgx1` という形で、
--   末尾が英字に寄っていた。どれがAIかは分からないはずの場で、IDの形だけで
--   見分けがついてしまう。最初から入っている住人（9876 など）に合わせる。
--
--   IDは posts.author_id / reactions.user_id / logs.user_id / users.id から
--   参照されているので、付け替えは順番が要る。users に新しい行を作ってから
--   参照元を移し、最後に古い行を消す。

DO $$
DECLARE
  target RECORD;
  new_id TEXT;
  now_ms BIGINT := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
BEGIN
  FOR target IN SELECT id FROM ai_characters WHERE id !~ '^[0-9]{4}$' LOOP

    -- 空いている4桁を探す。人のIDとも衝突させない
    LOOP
      new_id := (1000 + floor(random() * 9000))::INT::TEXT;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM ai_characters WHERE id = new_id)
            AND NOT EXISTS (SELECT 1 FROM users WHERE id = new_id);
    END LOOP;

    -- 1. 先に新しいIDの利用者行を作る（外部キーの向き先を用意する）
    INSERT INTO users (id, created_at, last_seen)
    VALUES (
      new_id,
      COALESCE((SELECT created_at FROM users WHERE id = target.id), now_ms),
      COALESCE((SELECT last_seen FROM users WHERE id = target.id), now_ms)
    )
    ON CONFLICT (id) DO NOTHING;

    -- 2. 参照を移す
    UPDATE posts SET author_id = new_id WHERE author_id = target.id;
    UPDATE reactions SET user_id = new_id WHERE user_id = target.id;
    UPDATE logs SET user_id = new_id WHERE user_id = target.id;

    -- 無い環境もあるテーブルは、在るときだけ触る
    IF to_regclass('public.chat_messages') IS NOT NULL THEN
      EXECUTE format('UPDATE chat_messages SET user_id = %L WHERE user_id = %L', new_id, target.id);
    END IF;
    IF to_regclass('public.feedback') IS NOT NULL THEN
      EXECUTE format('UPDATE feedback SET user_id = %L WHERE user_id = %L', new_id, target.id);
    END IF;

    -- 3. 住人そのものを移し、古い利用者行を消す
    UPDATE ai_characters SET id = new_id WHERE id = target.id;
    DELETE FROM users WHERE id = target.id;

    RAISE NOTICE 'AI % -> %', target.id, new_id;
  END LOOP;
END $$;
