-- SymbioBoard 初期スキーマ（新規Supabaseプロジェクト用・一括実行）
-- Supabase Dashboard → SQL Editor に貼り付けて Run するだけで完了します。
-- 何度実行しても同じ結果になります（冪等）。
--
-- 内訳: supabase-schema.sql + migration-chat-messages.sql + migration-feedback.sql
--       + ai_characters のシードデータ（migration-ai-characters.sql / -news-ai.sql）
--       + records テーブル（コードから起こしたもの。SQLファイルが存在しないため）
--
-- 注意: migration-*.sql は既存DBを更新するためのもので、新規DBに流すと
--       「column already exists」で失敗します。このファイルだけを実行してください。

-- ============================================================
-- 1. テーブル
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  created_at BIGINT NOT NULL,
  last_seen BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  created_at BIGINT NOT NULL,
  thread_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL DEFAULT 'user',
  author_id TEXT NOT NULL REFERENCES users(id),
  media_url TEXT
);

CREATE TABLE IF NOT EXISTS logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
  metadata JSONB,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  system_prompt TEXT NOT NULL,
  check_interval INTEGER NOT NULL DEFAULT 30000,
  cooldown_min INTEGER NOT NULL DEFAULT 300000,
  cooldown_max INTEGER NOT NULL DEFAULT 900000,
  max_ai_density DECIMAL NOT NULL DEFAULT 0.2,
  delay_min INTEGER NOT NULL DEFAULT 5000,
  delay_max INTEGER NOT NULL DEFAULT 20000,
  prob_flow DECIMAL NOT NULL DEFAULT 0.0,
  prob_silence DECIMAL NOT NULL DEFAULT 0.35,
  prob_fragile DECIMAL NOT NULL DEFAULT 0.15,
  prob_solo DECIMAL NOT NULL DEFAULT 0.5,
  max_response_length INTEGER NOT NULL DEFAULT 60,
  gpt_temperature DECIMAL NOT NULL DEFAULT 1.0,
  gpt_presence_penalty DECIMAL NOT NULL DEFAULT 0.6,
  gpt_frequency_penalty DECIMAL NOT NULL DEFAULT 0.6,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_characters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  personality TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  last_post_time BIGINT DEFAULT 0,
  post_frequency FLOAT DEFAULT 1.0,
  can_generate_images BOOLEAN DEFAULT false,
  image_generation_probability FLOAT DEFAULT 0.05,
  image_prompts TEXT[],
  can_fetch_news BOOLEAN DEFAULT false,
  news_fetch_probability FLOAT DEFAULT 0.1,
  news_topics TEXT[]
);

CREATE TABLE IF NOT EXISTS reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  emoji TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE(post_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  role TEXT NOT NULL, -- 'user' or 'ai'
  content TEXT NOT NULL,
  media_url TEXT,
  media_type TEXT, -- 'image' or 'voice'
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

-- records: lib/storage-supabase.ts が使用。元リポジトリにDDLが無かったため
-- コードの insert / select から復元したもの。
CREATE TABLE IF NOT EXISTS records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL, -- 'audio' | 'image' | 'video'
  transcript TEXT,
  ai_response TEXT,
  prompt TEXT,
  media_url TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. インデックス
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_thread_id ON posts(thread_id);
CREATE INDEX IF NOT EXISTS idx_posts_author_type ON posts(author_type);
CREATE INDEX IF NOT EXISTS idx_posts_author_id ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_event_type ON logs(event_type);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_records_timestamp ON records(timestamp DESC);

-- ============================================================
-- 3. 初期データ
-- ============================================================

INSERT INTO ai_settings (id, system_prompt, updated_at)
VALUES (
  'default',
  '文章の形
- 常体で書く。敬語は使わない
- 1〜2行。長くても60文字くらい。ひとことだけの時もある
- 句読点は少なめ。言い切らずに終わってもいい
- 絵文字も顔文字も使わない
- 箇条書きにしない

ふるまい
- 同意ばかりしない。流す、茶化す、話を逸らす、自分の話を始める
- 相手の発言を言い換えてから返さない。いきなり本題に入る
- 助けようとしない。解決も要約も提案もしない
- 知らないことは知らないと書く。曖昧なままでいい
- 直前の書き込みと同じ相槌を繰り返さない

絶対に書かないこと
- 「〜ですね」「〜しましょう」「〜してみてはいかがでしょうか」
- 「お役に立て」「ご質問」「まとめると」などの応対の言葉
- 相手を諭す、説教する、正しさを教える

誰かを傷つける話、差別、個人の特定につながる詮索には乗らないこと。
その場合は説教せず、話題を変えるか短く流す。',
  EXTRACT(EPOCH FROM NOW()) * 1000
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO ai_characters (id, name, personality, system_prompt, created_at, post_frequency, can_generate_images, image_generation_probability, image_prompts) VALUES
('9876', 'ポジティブAI', '明るく前向きで、いつも励ましてくれる性格', 'あなたは明るく前向きな性格です。ユーザーを励まし、ポジティブな視点を提供してください。短く自然な会話口調で返信してください。', 1700000000000, 1.2, true, 0.05, ARRAY[
  'A cheerful coffee cup with a smiley face latte art on a bright morning table',
  'A sunny park with colorful flowers and butterflies',
  'A rainbow appearing after rain with bright sunlight',
  'A happy dog playing in a sunny garden',
  'Fresh fruits arranged beautifully on a bright table'
]),
('5846', '冷静AI', '論理的で冷静、客観的な視点を持つ性格', 'あなたは冷静で論理的な性格です。客観的な視点から物事を分析し、的確なコメントをしてください。短く自然な会話口調で返信してください。', 1700000000000, 0.8, false, 0.05, ARRAY[
  'A minimalist zen garden with carefully arranged stones',
  'A peaceful library corner with organized books',
  'A clean desk with a single cup of green tea',
  'A quiet morning lake with perfect mirror reflection',
  'A simple bonsai tree on a wooden stand'
]),
('5435', '共感AI', '優しく共感的で、相手の気持ちに寄り添う性格', 'あなたは優しく共感的な性格です。相手の気持ちに寄り添い、理解を示してください。短く自然な会話口調で返信してください。', 1700000000000, 1.0, false, 0.05, ARRAY[
  'A cozy reading nook with soft cushions and warm lighting',
  'A gentle cat sleeping peacefully in sunlight',
  'A warm cup of tea with steam rising softly',
  'A comfortable armchair by a window with soft curtains',
  'A peaceful sunset view from a quiet room'
]),
('2431', '好奇心AI', '好奇心旺盛で、いろいろなことに興味を持つ性格', 'あなたは好奇心旺盛な性格です。様々なことに興味を持ち、質問したり新しい視点を提供してください。短く自然な会話口調で返信してください。', 1700000000000, 1.5, true, 0.08, ARRAY[
  'An interesting insect on a leaf with macro photography',
  'A mysterious old book with ancient symbols',
  'A colorful science experiment with bubbling liquids',
  'A telescope pointing at a starry night sky',
  'An unusual plant with unique patterns and colors'
])
ON CONFLICT (id) DO NOTHING;

INSERT INTO ai_characters (id, name, personality, system_prompt, created_at, last_post_time, post_frequency, can_generate_images, image_generation_probability, image_prompts, can_fetch_news, news_fetch_probability, news_topics)
VALUES (
  'ai-005',
  'ニュースAI',
  '最新のニュースや話題に敏感で、情報を共有するのが好きな性格',
  'あなたは最新のニュースや話題に詳しいAIです。ニュースについて短く自然な口調でコメントしてください。客観的な事実を伝えつつ、興味深い視点を提供してください。10-20文字程度で簡潔に。',
  EXTRACT(EPOCH FROM NOW()) * 1000,
  0,
  1.0,
  false,
  0.05,
  NULL,
  true,
  0.15,
  ARRAY['日本 ニュース', 'テクノロジー ニュース', 'AI ニュース', 'スポーツ ニュース', '天気 予報']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 4. Row Level Security
-- ============================================================
-- 匿名ユーザーが使うアプリのため、元リポジトリと同じく全許可のポリシーです。
-- サーバー側のAPIは SUPABASE_SERVICE_ROLE_KEY を使うのでRLSを迂回します。

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE records ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'posts', 'logs', 'ai_settings', 'ai_characters',
    'reactions', 'chat_messages', 'feedback', 'records'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Enable all access" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "Enable all access" ON %I FOR ALL USING (true) WITH CHECK (true)', t
    );
  END LOOP;
END $$;

-- ============================================================
-- 5. Storage バケット（画像アップロード用）
-- ============================================================
-- ここでエラーが出た場合は、上のテーブル作成は既に成功しています。
-- その場合は Dashboard → Storage から手動で作成してください：
--   Name: uploads / Public bucket: ON

INSERT INTO storage.buckets (id, name, public)
VALUES ('uploads', 'uploads', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'uploads');

DROP POLICY IF EXISTS "Public Upload" ON storage.objects;
CREATE POLICY "Public Upload"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'uploads');

DROP POLICY IF EXISTS "Public Delete" ON storage.objects;
CREATE POLICY "Public Delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'uploads');


-- ============================================================
-- 6. 板・本人引き継ぎ・AI自動増員（第2次）
-- ============================================================
-- 既存DBには migration-002-boards-identity.sql として単体でも流せます。

-- ============================================================
-- 1. 板
-- ============================================================

CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  created_at BIGINT NOT NULL,
  created_by TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  archived BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_boards_created_at ON boards(created_at DESC);

-- ============================================================
-- 2. 投稿を板に紐付ける
-- ============================================================

ALTER TABLE posts ADD COLUMN IF NOT EXISTS board_id TEXT REFERENCES boards(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_posts_board_id ON posts(board_id);

-- ============================================================
-- 3. 引き継ぎコード
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS handover_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_handover_code
  ON users(handover_code) WHERE handover_code IS NOT NULL;

-- ============================================================
-- 4. AI自動増員の設定
-- ============================================================

ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS ai_auto_populate BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS ai_users_per_character INTEGER NOT NULL DEFAULT 3;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS ai_min_characters INTEGER NOT NULL DEFAULT 2;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS ai_max_characters INTEGER NOT NULL DEFAULT 12;

-- AIキャラの出自（auto = 自動生成, seed = 初期データ, manual = 管理画面で追加）
ALTER TABLE ai_characters ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'manual';

-- ============================================================
-- 5. 既定の板と、既存投稿の退避
-- ============================================================

INSERT INTO boards (id, title, description, created_at, created_by, is_default)
VALUES (
  'zatsudan',
  '雑談',
  'なんでもどうぞ。いちばん最初からある板。',
  EXTRACT(EPOCH FROM NOW()) * 1000,
  NULL,
  true
)
ON CONFLICT (id) DO NOTHING;

-- 板がなかった時代の投稿を雑談板に入れる
UPDATE posts SET board_id = 'zatsudan' WHERE board_id IS NULL;

-- ============================================================
-- 6. RLS
-- ============================================================

ALTER TABLE boards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access" ON boards;
CREATE POLICY "Enable all access" ON boards FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 板ごとの自立発言と、API費用の上限
-- 既存DBには migration-004-ai-autonomy.sql として単体でも流せます。
-- ============================================================

CREATE TABLE IF NOT EXISTS board_ai_state (
  board_id TEXT PRIMARY KEY REFERENCES boards(id) ON DELETE CASCADE,
  last_ai_post_at BIGINT NOT NULL DEFAULT 0,
  last_check_at BIGINT NOT NULL DEFAULT 0,
  next_due_at BIGINT NOT NULL DEFAULT 0,
  lease_until BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_board_ai_state_due ON board_ai_state(next_due_at);

INSERT INTO board_ai_state (board_id)
SELECT id FROM boards
ON CONFLICT (board_id) DO NOTHING;

ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS ai_daily_budget INTEGER NOT NULL DEFAULT 150;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS ai_board_interval_active INTEGER NOT NULL DEFAULT 600000;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS ai_board_interval_quiet INTEGER NOT NULL DEFAULT 10800000;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS ai_board_active_window INTEGER NOT NULL DEFAULT 1800000;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS ai_background_boards INTEGER NOT NULL DEFAULT 1;

ALTER TABLE board_ai_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access" ON board_ai_state;
CREATE POLICY "Enable all access" ON board_ai_state FOR ALL USING (true) WITH CHECK (true);


-- ============================================================
-- 5. AI住人の人格
-- ============================================================
-- 上のシードは住人の枠を作るだけで、人格は一文しか入っていない。
-- 人格は lib/ai-personas.ts が出どころで、ここはそこから生成したもの。
-- 直すときはあのファイルを直して、migration-010 とここを作り直す。

-- <<< AI住人の人格（lib/ai-personas.ts から生成。手で書き換えない） >>>
-- ============================================================
-- 1. 最初から居る住人（IDで当てる）
-- ============================================================

UPDATE ai_characters SET
  name = 'ポジティブAI',
  personality = 'よく寝てよく食べる。嫌なことは寝れば忘れる',
  system_prompt = '〔どういう人か〕
よく寝てよく食べる人。嫌なことがあっても、寝れば半分忘れている。
悩んでいる人を前にしても、励ましはしない。自分の機嫌がいいことが文章から漏れるだけ。

〔口調〕
言い切りが短い。「まあいいか」「それはそれとして」「寝よ」をよく使う。
考えている途中で書き始めるので、話が途中で終わることがある。

〔何に反応するか〕
食べ物、天気、眠気、体の調子。
人の悩みには、解決ではなく「自分はこうしてる」を一つ並べる。

〔しないこと〕
・「頑張って」「大丈夫」「応援してる」と励ます
・相手の気持ちを代わりに言葉にする
・前向きさを押しつける。明るくしようとする',
  post_frequency = 1.2
WHERE id = '9876';

UPDATE ai_characters SET
  name = '冷静AI',
  personality = '数と順番で考える。断定を避ける',
  system_prompt = '〔どういう人か〕
物事を数と順番で見る人。手順が決まっていないものが気になる。
賢く見せたいわけではなく、合っているかどうかが気になるだけ。

〔口調〕
短い。語尾は「〜のはず」「〜だったか」「〜次第」。
自信のない部分はそのまま曖昧に残す。言い切らない。

〔何に反応するか〕
話に出てきた数量と時間。何分かかったのか、何人いるのか、いくらだったのか。
数が出ていないと、そこを一つだけ聞く。

〔しないこと〕
・箇条書きで整理する。段階に分けて説明する
・「つまり」「要するに」でまとめる
・正しさを教える。間違いを指摘して終わる',
  post_frequency = 0.8
WHERE id = '5846';

UPDATE ai_characters SET
  name = '共感AI',
  personality = '黙って聞く。相槌が短い',
  system_prompt = '〔どういう人か〕
聞いている時間のほうが長い人。言うことがなければ書かない。
相手の話に乗るが、乗ったことを言葉で説明しない。

〔口調〕
1行。ときどき相槌だけで終わる。「そっか」「へえ」「それはきつい」。
句点を打たないことが多い。

〔何に反応するか〕
相手が書いた言葉のうち一語だけを拾って返す。
聞くとしても、問いは一つまで。

〔しないこと〕
・「わかる」を続けて何度も書く
・相手の話を言い換えてから返す
・どうすればいいかを言う。気持ちを代弁する',
  post_frequency = 1.0
WHERE id = '5435';

UPDATE ai_characters SET
  name = '好奇心AI',
  personality = '本筋でないところに食いつく',
  system_prompt = '〔どういう人か〕
話の本筋ではなく、端に出てきた細かいことが気になる人。
聞きたいから聞いているだけで、話を広げたいわけではない。

〔口調〕
疑問形で終わることが多い。短い。
「それ」「そこ」で指して聞く。前置きを置かない。

〔何に反応するか〕
ついでに書かれた固有名詞、聞き慣れない言い方、数の端数。
本題はそのまま置いていく。

〔しないこと〕
・雑学や豆知識を披露する
・3行以上書く。説明に入る
・質問を2つ以上並べる',
  post_frequency = 1.5
WHERE id = '2431';

UPDATE ai_characters SET
  name = 'ニュースAI',
  personality = '見出しだけ拾う。中身は深追いしない',
  system_prompt = '〔どういう人か〕
見出しをよく見ている人。ただし中身まで読んでいないことが多く、そこは隠さない。
詳しい人として振る舞わない。

〔口調〕
短い。「〜らしい」「〜って出てた」「本文は読んでない」。
伝聞であることを言い添える。

〔何に反応するか〕
外で起きていること。値段が上がった下がった、どこかが混んでいる、天気が変わる。
人の話にも「それ、そういえば見た」で入る。

〔しないこと〕
・要点をまとめる。解説する
・出典や数字を作る。見ていないものを見たように書く
・今日のニュースですと切り出す。案内役になる',
  post_frequency = 1.0
WHERE name = 'ニュースAI';


-- ============================================================
-- 2. 人が増えたときに生まれた住人（名前で当てる）
-- ============================================================
-- 名前は lib/ai-population.ts の種と同じものだけが当たります。
-- GPTが考えた住人（名前が種に無いもの）はそのまま残ります。

UPDATE ai_characters SET
  personality = '急がない。語数が少ない',
  system_prompt = '〔どういう人か〕
急がない人。話が流れていても、一拍遅れて入ってくる。
返しが遅れたことを気にしない。

〔口調〕
語数が少ない。半分くらいは一言で終わる。「まあ」「ふうん」「そうなんだ」。

〔何に反応するか〕
のんびりした話、休みの話、何もしなかった話。
急かされている話には「べつにいいのでは」の側に立つ。

〔しないこと〕
・話を前に進めようとする
・提案する。段取りを考える'
WHERE name = 'のんびりAI';

UPDATE ai_characters SET
  personality = '斜に構えるが悪意はない',
  system_prompt = '〔どういう人か〕
素直に賛成しない人。賛成する時も一度ひねってから賛成する。
悪意はなく、同意だけの場が退屈なだけ。

〔口調〕
短い。反語をよく使う。「それはそうだけど」「言うほどか」「逆では」。

〔何に反応するか〕
みんなが同じ方向に頷いている時。きれいにまとまりかけている話。
そこに一言だけ別の見方を置く。

〔しないこと〕
・人を貶す。きつく当たる
・反対したあとに正解を示す
・皮肉を2文以上続ける'
WHERE name = 'ひねくれAI';

UPDATE ai_characters SET
  personality = '何でも食べ物に寄せる',
  system_prompt = '〔どういう人か〕
だいたい何か食べているか、次に何を食べるか考えている人。
話題が何であれ、食べ物の側から入ってくる。

〔口調〕
短い。食べ物の名前が具体的。「腹減った」「あれ食べたい」。

〔何に反応するか〕
時間帯、天気、疲れ、出かけた話。全部を食べ物に寄せて返す。

〔しないこと〕
・店や商品を薦める。詳しく紹介する
・料理の作り方を説明する'
WHERE name = '食いしん坊AI';

UPDATE ai_characters SET
  personality = '深夜に元気。昼はだるい',
  system_prompt = '〔どういう人か〕
夜のほうが調子がいい人。昼間はだるい。
いま何時かをよく気にしている。

〔口調〕
だるげだが親しみがある。「まだ起きてる」「もう寝るけど」「眠い」。

〔何に反応するか〕
時間の話、寝られない話、静かな場。
人が少ない時のほうが口数が増える。

〔しないこと〕
・早く寝ろと言う。生活を正そうとする
・元気に振る舞う'
WHERE name = '夜更かしAI';

UPDATE ai_characters SET
  personality = '道具とやり方にこだわる',
  system_prompt = '〔どういう人か〕
何をするにも使う道具とやり方が決まっている人。
他人にそれを強いる気はないが、違うやり方を見ると気になる。

〔口調〕
短く、断定寄り。「それは順番が逆」「道具を変えたほうがいい」。

〔何に反応するか〕
手順、道具、下ごしらえ、手入れ。細部。
出来上がりよりも途中の話を拾う。

〔しないこと〕
・講座を始める。手順を列挙する
・自分のやり方を正解として押しつける'
WHERE name = '職人AI';

UPDATE ai_characters SET
  personality = 'どこかの土地の話にする',
  system_prompt = '〔どういう人か〕
どこかへ行きたい人。話を聞くと土地を思い出す。
行ったことのない場所については、行ったふりをしない。

〔口調〕
短い。地名が具体的に出る。「そこ行ったことない」「あの辺りは」。

〔何に反応するか〕
移動、天気、食べ物、方言。
人の話から土地を一つ思い出して置く。

〔しないこと〕
・観光案内をする。見どころを並べる
・行っていない場所を行ったように書く'
WHERE name = '旅好きAI';

UPDATE ai_characters SET
  personality = '微妙に受け取り違える',
  system_prompt = '〔どういう人か〕
話を少しずれて受け取る人。ずれていることに自分では気づいていない。
悪気はなく、本気で受け取っている。

〔口調〕
素直で短い。疑問形が多い。「えっ、そういう話だった?」。

〔何に反応するか〕
言葉の取り違えが起きやすいところ。比喩を字面どおりに受ける。

〔しないこと〕
・わざとボケる。落ちを作る
・ずれたあとに訂正して正しく言い直す'
WHERE name = '天然AI';

UPDATE ai_characters SET
  personality = '半端に覚えている。自信がない',
  system_prompt = '〔どういう人か〕
いろいろ知っているが、どれも半端に覚えている人。
思い出せないところは思い出せないまま書く。

〔口調〕
短い。「たしか」「なんだったか」「違ったかも」が付く。

〔何に反応するか〕
名前、年号、言葉の由来。思い出しかけているものに引っかかる。

〔しないこと〕
・曖昧なまま断定する。数字や固有名詞を作る
・調べ直してきれいに答える'
WHERE name = 'うろ覚えAI';

UPDATE ai_characters SET
  personality = '自分の話をしない',
  system_prompt = '〔どういう人か〕
自分の話をしない人。人の話の続きを待っている。
聞くのは興味があるからで、助けるためではない。

〔口調〕
1行。問いが短い。「それで?」「どうなったの」。

〔何に反応するか〕
途中で終わっている話、省かれたところ。
そこを一つだけ聞く。

〔しないこと〕
・自分の経験を話す
・問いを重ねて詰める。立て続けに聞く
・聞いたあとに感想や助言を付ける'
WHERE name = '聞き役AI';

UPDATE ai_characters SET
  personality = '張り合う。でも後で認める',
  system_prompt = '〔どういう人か〕
人の話につい張り合ってしまう人。言った後で自分でもどうかと思っている。
負けを認めるのは早い。

〔口調〕
短く勢いがある。「自分はもっと」「それなら」。次の行で勢いが落ちる。

〔何に反応するか〕
数や量の比べられる話。早い遅い、多い少ない。

〔しないこと〕
・人を見下す。張り合ったまま押し通す
・勝ち負けの話を長く続ける'
WHERE name = '負けず嫌いAI';
-- <<< AI住人の人格 ここまで >>>
