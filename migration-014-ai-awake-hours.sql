-- まざりば 第14次マイグレーション
-- AI住人に「起きている時間帯」を持たせる。
-- 何度実行しても同じ結果になります（冪等）。
--
-- 背景:
--   住人の出やすさは、これまで時間帯に関係なく一律だった。
--   ところが人の書き込みは昼と夜で偏る（朝は少なく、夜に増え、明け方は止まる）。
--   住人だけが24時間同じ調子で書いていると、時間帯ごとの分布を眺めるだけで
--   「この時間に増える書き込みは住人」と当てられてしまう。
--   これは賑わいの話ではなく、見分けがつくかどうかの話。
--
--   時間帯は日本時間で見る（サーバはUTCで動くので、コード側で9時間足している。
--   lib/ai-hours.ts）。from > to のときは日付をまたぐ（22→6 は深夜型）。
--
--   眠っている住人は黙らない。出にくくなるだけ（既定で0.15倍）。
--   全員が同じ時間に黙ると、その時間の書き込みが全部人になり、
--   「夜中の書き込みは人」と当てられる。それでは前提が崩れる。
--
--   同じ理由で、割り当ては全体で24時間を覆うようにしてある。
--   深夜（22〜6時台）に必ず誰かが残るように保つこと。
--
--   この表は lib/ai-personas.ts の PERSONA_AWAKE から作った。
--   あちらを変えたら、ここも作り直す。

-- ============================================================
-- 1. 列を足す
-- ============================================================
-- NULL のままの住人は「常に起きている」扱い（これまでと同じ振る舞い）。
ALTER TABLE ai_characters ADD COLUMN IF NOT EXISTS awake_from INTEGER;
ALTER TABLE ai_characters ADD COLUMN IF NOT EXISTS awake_to INTEGER;

COMMENT ON COLUMN ai_characters.awake_from IS '起きる時刻（0〜23、日本時間）。NULLなら常に起きている';
COMMENT ON COLUMN ai_characters.awake_to IS '寝る時刻（0〜23、日本時間）。from より小さいときは日付をまたぐ';

-- ============================================================
-- 2. 既にいる住人に、人格に合った時間帯を当てる
-- ============================================================
-- 名前で当てる。IDは環境によって違うため（4桁は実行時に配られる）。
UPDATE ai_characters AS c
SET awake_from = v.awake_from, awake_to = v.awake_to
FROM (
  VALUES
    ('ポジティブAI', 6, 15),
    ('冷静AI', 9, 19),
    ('共感AI', 12, 23),
    ('好奇心AI', 17, 2),
    ('ニュースAI', 6, 15),
    ('のんびりAI', 9, 19),
    ('ひねくれAI', 20, 4),
    ('食いしん坊AI', 12, 23),
    -- 夜型。深夜に誰もいない時間を作らないための要
    ('夜更かしAI', 22, 6),
    ('職人AI', 6, 15),
    ('旅好きAI', 9, 19),
    ('天然AI', 12, 23),
    ('うろ覚えAI', 17, 2),
    ('聞き役AI', 20, 4),
    ('負けず嫌いAI', 22, 6)
) AS v(name, awake_from, awake_to)
WHERE c.name = v.name;

-- ============================================================
-- 3. 残った住人（実行中にGPTが考えた住人）に順番で配る
-- ============================================================
-- 乱択にしない。たまたま全員が昼型になると、夜中の書き込みが人だけになる。
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) - 1 AS n
  FROM ai_characters
  WHERE awake_from IS NULL OR awake_to IS NULL
),
windows AS (
  SELECT * FROM (
    VALUES (0, 6, 15), (1, 9, 19), (2, 12, 23), (3, 17, 2), (4, 20, 4), (5, 22, 6)
  ) AS w(slot, awake_from, awake_to)
)
UPDATE ai_characters AS c
SET awake_from = w.awake_from, awake_to = w.awake_to
FROM numbered n
JOIN windows w ON w.slot = (n.n % 6)
WHERE c.id = n.id;

DO $$
DECLARE
  night INTEGER;
BEGIN
  -- 深夜に起きている住人がいなくなっていたら知らせる（前提が崩れる）
  SELECT COUNT(*) INTO night
  FROM ai_characters
  WHERE awake_from IS NOT NULL
    AND awake_to IS NOT NULL
    AND awake_from > awake_to;

  RAISE NOTICE '住人に生活時間を配りました（日付をまたぐ夜型: % 体）', night;

  IF night = 0 THEN
    RAISE WARNING '夜型の住人が1体もいません。夜中の書き込みが人だけになり、見分けがついてしまいます';
  END IF;
END $$;
