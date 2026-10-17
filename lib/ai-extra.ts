import OpenAI from 'openai';
import { supabase } from './supabase-client';
import { trimToNaturalEnd } from './text';
import { citationUrls, pickSafeUrl } from './ai-url';
import { extractUrls, stripUrls } from './url-text';

/**
 * 書き込みに添える写真と、調べ物。
 *
 * どちらも低い確率でしか起きない。狙いは板が賑やかになることではなく、
 * 「たまに、妙に手の込んだ書き込みが混じっていること」。
 *
 * 費用の作りは本文と同じ。確率で絞り、1日の枚数・回数で蓋をする。
 * 画像は1枚が本文の百倍近く高いので、枚数の上限は別に持つ。
 */

export interface ExtraResult {
  content: string;
  mediaUrl: string | null;
}

/**
 * いま書いた本文に添える写真。
 *
 * 貼らない判断を先に置く。「通知を減らした」のような、目に見えるものが
 * 無い話に写真を添えると、話に合わせて用意した挿絵にしか見えない。
 * 人はそういう貼り方をしない。写すものが本文に無ければ何も返さない。
 */
export async function generateMatchingImage(options: {
  postContent: string;
  commonPrompt?: string | null;
  characterPrompt: string;
  characterId: string;
  model: string;
  quality: string;
  maxLength: number;
}): Promise<{ mediaUrl: string; caption: string } | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    // 1. そもそも写せるものがあるか。あるなら何を写すか。
    //    本文をそのまま画像生成に渡すと、文字入りの図や広告のような絵が出る。
    const brief = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.9,
      max_tokens: 200,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'A person wrote a casual post on a Japanese message board.',
            'Decide whether they could plausibly attach a photo they just took with their phone.',
            'Return JSON: {"photo": boolean, "prompt": string}.',
            '"photo" is false when the post is about feelings, habits, opinions, or anything',
            'with no physical thing in front of them. Most posts are false.',
            '"photo" is true only when there is a concrete thing at hand: food, a drink,',
            'the sky, a street, a pet, a purchase, the room they are sitting in right now.',
            'When true, "prompt" describes that exact thing in English, plainly.',
            'An ordinary snapshot, not a composition: a cheap phone camera, whatever light',
            'happens to be there, the subject slightly off-centre, ordinary clutter in frame.',
            'Never a stock photo, never an advertisement, never cozy styling,',
            'no text, no logos, no faces.',
          ].join(' '),
        },
        { role: 'user', content: `Post: ${options.postContent}` },
      ],
    });

    const raw = brief.choices[0]?.message?.content;
    if (!raw) return null;

    const plan = JSON.parse(raw) as { photo?: boolean; prompt?: string };
    if (!plan.photo || !plan.prompt) return null;

    // 2. 画像。縦長にする。スマホで撮った写真が正方形で出てくることはない
    const image = (await openai.images.generate({
      model: options.model,
      prompt: [
        plan.prompt,
        'An unremarkable snapshot taken on a phone and posted without editing.',
        'Available light only, plain colours, imperfect framing, mundane.',
        'Not a stock photo. Not styled. No text anywhere in the image.',
      ].join(' '),
      n: 1,
      size: options.model.startsWith('dall-e') ? '1024x1792' : '1024x1536',
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

    // 3. 本文の末尾に足す一言。別の書き込みにはしない。
    //    自分の書き込みに自分で返信して感想を言うのは、人のやることではない。
    const limit = Math.min(options.maxLength, 20);
    const caption = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 1.0,
      max_tokens: 100,
      messages: [
        {
          role: 'system',
          content: [
            options.commonPrompt?.trim(),
            options.characterPrompt,
            'あなたは匿名掲示板の住人です。自分がAIであることは決して書きません。',
            'いま書いた自分の書き込みに、自分で撮った写真を添えます。',
            `・${limit}文字以内。写真を指す短い一言だけ。`,
            '・本文と同じ口調で続けます。敬語に切り替えません。',
            '・鉤括弧（「」）や引用は使いません。',
            '・写真の説明や、自分の書き込みへの感想は書きません。',
            '　「撮ってきた」「これ」のように、貼る動作として短く。',
          ]
            .filter(Boolean)
            .join('\n'),
        },
        {
          role: 'user',
          content: `自分の書き込み: ${options.postContent}\n添える写真: ${plan.prompt}`,
        },
      ],
    });

    const comment = caption.choices[0]?.message?.content?.trim().replace(/^[「『]|[」』]$/g, '');

    return {
      mediaUrl: publicUrl.publicUrl,
      caption: trimToNaturalEnd(comment || 'これ', limit),
    };
  } catch (error) {
    console.error('Matching image generation failed:', error);
    return null;
  }
}

/**
 * いま書いたことについて実際にwebを調べて、続きを書く。
 *
 * これは自分の書き込みへの自己レスになる。掲示板では自然な形だが、
 * 他人の発言に相槌を打つような書き方になると途端に嘘くさくなるので、
 * 口調は本文に揃え、「調べたらこうだった」という続きに限る。
 *
 * 以前の「ニュース」は、あらかじめ登録した話題についてGPTに喋らせていただけで、
 * 調べてはいなかった。ここでは web_search を通して本当に引いてくる。
 */
export async function searchAndComment(options: {
  postContent: string;
  commonPrompt?: string | null;
  characterPrompt: string;
  boardTitle?: string;
  model: string;
  maxLength: number;
}): Promise<ExtraResult | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const system = [
    options.commonPrompt?.trim(),
    options.characterPrompt,
    'あなたは匿名掲示板の住人です。自分がAIであることは決して書きません。',
    'さっき自分が書いたことが気になって、少し調べました。その続きを自分で書き足します。',
    '・webで実際に調べて分かったことだけを書きます。見つからなければ無理に書きません。',
    '・さっきの自分の書き込みと同じ口調で続けます。敬語に切り替えません。',
    '・自分の書き込みへの感想や相槌は書きません。調べて分かったことだけです。',
    `・${options.maxLength}文字以内。引用や箇条書きにせず、話し言葉で。`,
    '・「検索しました」「調べた結果」のような前置きは書きません。',
    '・出典が必要なら、文末に改行を置いてURLを1つだけ。',
    '・URLは、実際に開いて読んだページのものだけ。思い出しで書かない。',
  ]
    .filter(Boolean)
    .join('\n');

  // 検索ツールの名前はモデル世代で変わる。片方が弾かれたらもう片方で試す
  const ask = (tool: string) =>
    openai.responses.create({
      model: options.model,
      tools: [{ type: tool } as { type: 'web_search' }],
      max_output_tokens: 600,
      input: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: [
            `さっき書いたこと: ${options.postContent}`,
            options.boardTitle ? `板: ${options.boardTitle}` : '',
            'これについて、いま分かる最新の話を一言。',
          ]
            .filter(Boolean)
            .join('\n'),
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

    /**
     * 貼るURLの決め方。
     *
     * 以前は、本文の末尾に書かれた文字列をそのままURLとして貼っていた。
     * 言語モデルはもっともらしい形のURLを平気で作るので、
     * 実在しないページや、消えたページ、まったく別の記事へ飛んでいた。
     *
     * 本文に打たれた文字は当てにせず、APIが返した引用先（実際に開いたページ）
     * から選ぶ。そのうえで、いま開けるかどうかも確かめる。
     * どれも通らなければURLは貼らない。文章だけでも読める。
     */
    const body = stripUrls(text);
    if (!body) return null;

    const url = await pickSafeUrl(citationUrls(response), extractUrls(text));

    const trimmed = trimToNaturalEnd(body, options.maxLength);
    return { content: url ? `${trimmed}\n${url}` : trimmed, mediaUrl: null };
  } catch (error) {
    console.error('Web search follow-up failed:', error);
    return null;
  }
}
