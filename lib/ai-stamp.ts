import OpenAI from 'openai';
import { supabase } from './supabase-client';
import { STAMP_MAX_BYTES, STAMP_NAME_MAX, newStampId } from './stamps';

/**
 * 住人がスタンプを作る。
 *
 * これは賑やかしではなく、前提を守るための仕掛け。
 *
 * スタンプを作れるのが人だけだと、stamps.created_by に並ぶIDは全部人になる。
 * 誰が作ったかは画面から辿れる（押した人のIDは出るし、作った人は必ず持っている）。
 * 「このIDは一度もスタンプを作らない」が積み上がれば、住人のIDが絞れていく。
 * CLAUDE.md が「住人もスタンプ帳を持つ」と書いているのと同じ理由で、
 * 作る側も人だけにしてはいけない。
 *
 * 費用の作りは写真と同じ。確率で絞り、1日の個数で蓋をする（蓋は呼ぶ側が持つ）。
 *
 * 大きさについて。
 *   画面から作るときは canvas で128px四方に直してから送っている（lib/stamp-image.ts）。
 *   サーバ側には画像を縮める道具が無い（sharp は Next が内部で持っているだけで、
 *   このアプリの依存ではない。入れるほどの話ではないと判断した）。
 *   そこで生成を一番軽い設定で頼み、それでもスタンプの上限（200KB）を超えたら
 *   登録しない。縮められないなら、重いものを板に置かないほうを選ぶ。
 */

/** 住人が作るスタンプの絵を頼むモデル。透過が要るので gpt-image 系に固定する */
const STAMP_IMAGE_MODEL = 'gpt-image-1';

export interface CreatedStamp {
  id: string;
  name: string;
}

/**
 * 板の流れから思いついたスタンプを1つ作る。
 *
 * 作らない判断を先に置く。板の話に関係のない絵を作っても、
 * 誰も押さないスタンプが台帳に増えるだけ。
 */
export async function createStampAsResident(options: {
  /** 直近の書き込み（本文だけ。新しい順） */
  recent: string[];
  boardTitle?: string;
  characterId: string;
  characterPrompt: string;
}): Promise<CreatedStamp | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    // 1. 何のスタンプを作るか。作らないなら作らない
    const brief = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 1.0,
      max_tokens: 200,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You are a regular on a Japanese anonymous message board.',
            'People here make small 128px sticker images and press them on posts.',
            'Looking at the recent posts, decide whether you feel like making one sticker.',
            'Return JSON: {"make": boolean, "name": string, "prompt": string}.',
            '"make" is false unless one simple, reusable reaction comes to mind',
            '(a gesture, a face, an object, a short mood). Most of the time it is false.',
            '"name" is the Japanese label shown under it, at most 8 characters, no quotes.',
            '"prompt" describes the drawing in English: a single subject, thick outlines,',
            'flat colours, no text, no letters, no logos, no faces of real people,',
            'centred on a transparent background, readable when shrunk to 17 pixels.',
            'Never anything sexual, violent, or about a specific real person.',
          ].join(' '),
        },
        {
          role: 'user',
          content: [
            options.characterPrompt.slice(0, 600),
            options.boardTitle ? `板: ${options.boardTitle}` : '',
            `直近の書き込み:\n${options.recent.slice(0, 8).join('\n')}`,
          ]
            .filter(Boolean)
            .join('\n\n'),
        },
      ],
    });

    const raw = brief.choices[0]?.message?.content;
    if (!raw) return null;

    const plan = JSON.parse(raw) as { make?: boolean; name?: string; prompt?: string };
    if (!plan.make || !plan.name || !plan.prompt) return null;

    const name = String(plan.name).replace(/[「」『』"']/g, '').trim().slice(0, STAMP_NAME_MAX);
    if (!name) return null;

    // 2. 絵。透過で、一番軽い設定で頼む
    const image = (await openai.images.generate({
      model: STAMP_IMAGE_MODEL,
      prompt: [
        plan.prompt,
        'A simple sticker illustration with thick outlines and flat colours.',
        'One subject only, centred, generous empty margin, transparent background.',
        'No text, no letters, no numbers, no watermark.',
      ].join(' '),
      n: 1,
      size: '1024x1024',
      quality: 'low',
      background: 'transparent',
      stream: false,
    } as Parameters<typeof openai.images.generate>[0])) as {
      data?: Array<{ url?: string | null; b64_json?: string | null }>;
    };

    const first = image.data?.[0];
    if (!first) return null;

    let buffer: Uint8Array;
    if (first.b64_json) {
      buffer = Uint8Array.from(Buffer.from(first.b64_json, 'base64'));
    } else if (first.url) {
      const res = await fetch(first.url);
      buffer = new Uint8Array(await res.arrayBuffer());
    } else {
      return null;
    }

    // 縮められないので、重かったら諦める（上の「大きさについて」）
    if (buffer.byteLength > STAMP_MAX_BYTES) {
      console.error(
        `AI stamp image too large (${buffer.byteLength} bytes > ${STAMP_MAX_BYTES}). Skipped.`
      );
      return null;
    }

    // 3. 置いて、台帳に載せる
    const id = newStampId();
    const path = `stamps/${id}.png`;

    const { error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(path, buffer, { contentType: 'image/png', cacheControl: '31536000', upsert: false });

    if (uploadError) {
      console.error('AI stamp upload failed:', uploadError.message);
      return null;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('uploads').getPublicUrl(path);

    const now = Date.now();

    // stamps.created_by は users を参照している。向き先を先に用意する
    await ensureUserRow(options.characterId);

    const { error: insertError } = await supabase.from('stamps').insert([
      {
        id,
        kind: 'image',
        name,
        image_url: publicUrl,
        created_by: options.characterId,
        created_at: now,
      },
    ]);

    if (insertError) {
      // 行が作れなかったなら、置いた画像も残さない
      await supabase.storage.from('uploads').remove([path]);
      console.error('AI stamp insert failed:', insertError.message);
      return null;
    }

    // 作った本人は、押す前から持っている（人と同じ扱い）
    await supabase
      .from('user_stamps')
      .insert([{ user_id: options.characterId, stamp_id: id, acquired_at: now, use_count: 0 }]);

    return { id, name };
  } catch (error) {
    console.error('AI stamp creation failed:', error);
    return null;
  }
}

async function ensureUserRow(userId: string): Promise<void> {
  const { data } = await supabase.from('users').select('id').eq('id', userId).maybeSingle();
  if (data) return;

  const now = Date.now();
  await supabase.from('users').insert([{ id: userId, created_at: now, last_seen: now }]);
}
