-- まざりば 第11次マイグレーション
-- スタンプを「文字列」から「物」にする。自分で作った画像も押せるようにする。
-- 何度実行しても同じ結果になります（冪等）。
--
-- 背景:
--   これまでスタンプは reactions.emoji に入った絵文字の文字そのものだった。
--   押せるのは決め打ちの6個だけで、増やす場所がなかった。
--
--   作った画像を押せるようにするが、スタンプは板をまたいで共有される「物」に
--   なるので、どこかに実体が要る。それが stamps。
--   誰が何を持っているかは user_stamps に置く。持ち物は人ごと、物は共有。
--
--   肝は stamps.id の決め方で、既定のスタンプは「絵文字の文字そのもの」をIDにする。
--   reactions.emoji には今も '👍' が入っているので、こうしておけば
--   既存の押印も UNIQUE(post_id, user_id, emoji) もそのまま生きる。
--   画像のスタンプだけ 's_xxxxxxxx' という別の形のIDが入る。
--
--   画面側は、知らないIDが来たらその文字をそのまま出す。
--   スタンプが止められても、過去のレスが壊れないようにするため。

-- ============================================================
-- 1. スタンプそのもの（板をまたいで共有される）
-- ============================================================
CREATE TABLE IF NOT EXISTS stamps (
  id TEXT PRIMARY KEY,
  -- 'unicode'（既定の絵文字） か 'image'（誰かが作ったもの）
  kind TEXT NOT NULL DEFAULT 'image',
  -- 探すときと読み上げに使う名前
  name TEXT NOT NULL,
  -- kind='image' のときだけ入る
  image_url TEXT,
  created_by TEXT REFERENCES users(id),
  created_at BIGINT NOT NULL,
  -- 止めたスタンプ。消さずに止める（消すと過去の押印が読めなくなる）
  disabled BOOLEAN NOT NULL DEFAULT FALSE,
  report_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_stamps_created_at ON stamps(created_at DESC);

-- ============================================================
-- 2. 誰が何を持っているか（＝スタンプ帳）
-- ============================================================
-- 持っていないスタンプを押すと、その場で増える。
-- 増え方が「使うこと」なので、板を渡り歩くほど増えていく。
CREATE TABLE IF NOT EXISTS user_stamps (
  user_id TEXT NOT NULL REFERENCES users(id),
  stamp_id TEXT NOT NULL REFERENCES stamps(id),
  acquired_at BIGINT NOT NULL,
  use_count INTEGER NOT NULL DEFAULT 0,
  last_used_at BIGINT,
  PRIMARY KEY (user_id, stamp_id)
);

CREATE INDEX IF NOT EXISTS idx_user_stamps_user ON user_stamps(user_id);

-- ============================================================
-- 3. 通報
-- ============================================================
-- 同じ人が同じスタンプを何度も通報しても1件として数える。
CREATE TABLE IF NOT EXISTS stamp_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stamp_id TEXT NOT NULL REFERENCES stamps(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  reason TEXT,
  created_at BIGINT NOT NULL,
  UNIQUE(stamp_id, user_id)
);

-- ============================================================
-- 4. 既定のスタンプ
-- ============================================================
-- IDは絵文字の文字そのもの。これまでの押印がそのまま指し先を持つ。
-- 既定は誰かが作ったものではないので created_by は空。
-- 止められないように、通報が溜まっても自動では disabled にしない（アプリ側で除外）。
INSERT INTO stamps (id, kind, name, image_url, created_by, created_at) VALUES
  ('👍', 'unicode', 'いいね', NULL, NULL, 1700000000000),
  ('❤️', 'unicode', 'すき', NULL, NULL, 1700000000000),
  ('😂', 'unicode', 'わらう', NULL, NULL, 1700000000000),
  ('🎉', 'unicode', 'おめでとう', NULL, NULL, 1700000000000),
  ('🤔', 'unicode', 'かんがえる', NULL, NULL, 1700000000000),
  ('👀', 'unicode', 'みてる', NULL, NULL, 1700000000000)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 5. これまでの押印を、持ち物に反映する
-- ============================================================
-- 既に押したことのあるスタンプは、もう持っているものとして扱う。
-- 既定の6個は全員が最初から持っているので、ここで入れるのは記録のためだけ。
INSERT INTO user_stamps (user_id, stamp_id, acquired_at, use_count, last_used_at)
SELECT
  r.user_id,
  r.emoji,
  MIN(r.created_at),
  COUNT(*)::INTEGER,
  MAX(r.created_at)
FROM reactions r
JOIN stamps s ON s.id = r.emoji
JOIN users u ON u.id = r.user_id
GROUP BY r.user_id, r.emoji
ON CONFLICT (user_id, stamp_id) DO NOTHING;

-- ============================================================
-- 6. Row Level Security
-- ============================================================
-- 既存のテーブルと同じ扱い（サーバ側のAPIは service role で迂回する）。
ALTER TABLE stamps ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stamps ENABLE ROW LEVEL SECURITY;
ALTER TABLE stamp_reports ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['stamps', 'user_stamps', 'stamp_reports']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Enable all access" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "Enable all access" ON %I FOR ALL USING (true) WITH CHECK (true)', t
    );
  END LOOP;
END $$;

DO $$
BEGIN
  RAISE NOTICE 'スタンプの台帳を用意しました（既定6個）';
END $$;
