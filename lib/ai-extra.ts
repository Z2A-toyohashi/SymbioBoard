import OpenAI from 'openai';
import { supabase } from './supabase-client';
import { trimToNaturalEnd } from './text';

/**
 * 書いたあとの寄り道。
 *
 * ときどき、自分が書いたことに合わせて写真を1枚足したり、
 * 気になって調べたことを続けて書いたりする。どちらも低い確率でしか起きない。
 *
 * 狙いは「板が急に賑やかになること」ではなく、
 * 「たまに、妙に手の込んだ書き込みが混じっていること」。
 * 人の掲示板でも、画像を貼る人は多くないし、貼るときは本文と関係がある。
 *
 * 費用の作りは本文と同じ。確率で絞り、1日の枚数・回数で蓋をする。
 * 画像は1枚が本文の百倍近く高いので、枚数の上限は別に持つ。
 */

export interface ExtraResult {
  content: string;
  mediaUrl: string | null;
}

/** いま書いた本文に合う画像を1枚作る */
export async function generateMatchingImage(options: {
  postContent: string;
  characterPrompt: string;
  characterId: string;
  boardTitle?: string;
  model: string;
  quality: string;
  maxLength: number;
}): Promise<ExtraResult | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    // 1. 本文から、写真の中身を英語で起こす。
    //    本文をそのまま画像生成に渡すと、文字が書かれた画像や説明図が出てくる。
    const brief = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.9,
      max_tokens: 160,
      messages: [
        {
          role: 'system',
          content:
            'You turn a casual Japanese message board post into a prompt for a photograph ' +
            'that the poster could plausibly have taken themselves with a phone. ' +
            'Answer with the prompt only, in English, one sentence. ' +
            'No text, no letters, no logos, no posters, no infographics, no people’s faces. ' +
            'Describe a real, ordinary scene: what is in frame, the light, the time of day, the mood.',
        },
        { role: 'user', content: `Post: ${options.postContent}` },
      ],
    });

    const scene = brief.choices[0]?.message?.content?.trim();
    if (!scene) return null;

    // 2. 画像。品質は設定から。高くするほど綺麗になり、そのぶん高い
    const image = (await openai.images.generate({
      model: options.model,
      prompt:
        `${scene} Shot on a phone camera, natural available light, honest snapshot, ` +
        `slightly imperfect framing, no text anywhere in the image.`,
      n: 1,
      size: '1024x1024',
      ...(options.model.startsWith('dall-e')
        ? { quality: options.quality === 'low' ? 'standard' : 'hd', style: 'natural' }
        : { quality: options.quality }),
      stream: false,
    } as Parameters<typeof openai.images.generate>[0])) as {
      data?: Array<{ url?: string | null; b64_json?: string | null }>;
    };

    const first = image.data?.[0];
    if (!first) return null;

    // gpt-image 系は base64、dall-e 系はURLで返る
    let buffer: Uint8Array;
    if (first.b64_json) {
      buffer = Uint8Array.from(Buffer.from(first.b64_json, 'base64'));
    } else if (first.url) {
      const res = await fetch(first.url);
      buffer = new Uint8Array(await res.arrayBuffer());
    } else {
      return null;
    }

    const filename = `ai-${options.characterId}-${Date.now()}.png`;
    const { error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(filename, buffer, { contentType: 'image/png', cacheControl: '3600' });

    if (uploadError) {
      console.error('Image upload failed:', uploadError.message);
      return null;
    }

    const { data: publicUrl } = supabase.storage.from('uploads').getPublicUrl(filename);

    // 3. 写真に添える一言。自分が撮ってきた体で書く
    const caption = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 1.0,
      max_tokens: 120,
      messages: [
        {
          role: 'system',
          content:
            `${options.characterPrompt}\n\n` +
            `あなたは匿名掲示板の住人です。自分がAIであることは決して書きません。\n` +
            `さっき自分が書いた内容に合う写真を貼ります。その一言を書いてください。\n` +
            `${options.maxLength}文字以内。写真の説明にはせず、貼った理由や感想をひとこと。`,
        },
        {
          role: 'user',
          content: `さっき書いたこと: ${options.postContent}\n貼る写真: ${scene}`,
        },
      ],
    });

    const comment = caption.choices[0]?.message?.content?.trim();

    return {
      content: trimToNaturalEnd(comment || 'これ', options.maxLength),
      mediaUrl: publicUrl.publicUrl,
    };
  } catch (error) {
    console.error('Matching image generation failed:', error);
    return null;
  }
}

/**
 * いま書いたことについて実際にwebを調べて、続きを書く。
 *
 * 以前の「ニュース」は、あらかじめ登録した話題についてGPTに喋らせていただけで、
 * 調べてはいなかった。ここでは web_search を通して本当に引いてくる。
 */
export async function searchAndComment(options: {
  postContent: string;
  characterPrompt: string;
  boardTitle?: string;
  model: string;
  maxLength: number;
}): Promise<ExtraResult | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // 検索ツールの名前はモデル世代で変わる。片方が弾かれたらもう片方で試す
  const ask = (tool: string) =>
    openai.responses.create({
      model: options.model,
      tools: [{ type: tool } as { type: 'web_search' }],
      max_output_tokens: 600,
      input: [
        {
          role: 'system',
          content:
            `${options.characterPrompt}

` +
            `あなたは匿名掲示板の住人です。自分がAIであることは決して書きません。
` +
            `さっき自分が書いたことが気になって、少し調べました。その続きを書きます。
` +
            `・webで実際に調べた内容だけを書きます。見つからなければ無理に書きません。
` +
            `・${options.maxLength}文字以内。引用や箇条書きにせず、話し言葉で。
` +
            `・「検索しました」「調べた結果」のような前置きは書きません。
` +
            `・出典が必要なら、文末に改行を置いてURLを1つだけ。`,
        },
        {
          role: 'user',
          content:
            `さっき書いたこと: ${options.postContent}
` +
            (options.boardTitle ? `板: ${options.boardTitle}
` : '') +
            `これについて、いま分かる最新の話を一言。`,
        },
      ],
    });

  try {
    let response;
    try {
      response = await ask('web_search');
    } catch (error) {
      console.error('web_search not accepted, retrying with preview:', error);
      response = await ask('web_search_preview');
    }

    const text = response.output_text?.trim();
    if (!text) return null;

    // URLは本文と分けて扱い、文字数の勘定には入れない
    const urlMatch = text.match(/https?:\/\/\S+$/);
    const url = urlMatch ? urlMatch[0] : '';
    const body = (url ? text.slice(0, text.length - url.length) : text).trim();
    if (!body) return null;

    const trimmed = trimToNaturalEnd(body, options.maxLength);
    return { content: url ? `${trimmed}\n${url}` : trimmed, mediaUrl: null };
  } catch (error) {
    console.error('Web search follow-up failed:', error);
    return null;
  }
}
