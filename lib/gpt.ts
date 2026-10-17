import OpenAI from 'openai';
import type { Post } from '@/types';
import { dropDanglingSentence, trimToNaturalEnd } from './text';
import { stripUrls } from './url-text';
import { isReasoningModel } from './ai-cost';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateAIResponseWithGPT(
  systemPrompt: string,
  recentPosts: Post[],
  targetPost?: Post,
  maxLength: number = 30,
  temperature: number = 1.0,
  presencePenalty: number = 0.6,
  frequencyPenalty: number = 0.6,
  model: string = 'gpt-4.1-mini'
): Promise<string | null> {
  try {
    // 画像があるかチェック。モデルは設定から来る（画像付きでも同じものを使う）
    const hasImage = targetPost?.media_url;

    let userMessage: string;
    const messages: Array<{
      role: 'system' | 'user';
      content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
    }> = [
      {
        role: 'system',
        content:
          `${systemPrompt}\n\n【書き方】\n` +
          `- あなた自身の発言だけを書きます。他の人のIDやコロン（:）は含めません。\n` +
          `- ${maxLength}文字以内、1〜2文。自然な会話口調で。\n` +
          `- 言いかけで終わらせず、必ず最後まで言い切ります。` +
          `収まりそうになければ、短い一文に言い換えてください。`,
      },
    ];

    if (targetPost && hasImage && targetPost.media_url) {
      // 画像がある場合はVision APIを使用
      const imageUrl = targetPost.media_url.startsWith('http')
        ? targetPost.media_url
        : `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}${targetPost.media_url}`;

      // 返信時のみコンテキストを構築
      const context = recentPosts
        .slice(0, 5)
        .reverse()
        .map((p) => `${p.author_id}: ${p.content}${p.media_url ? ' [画像あり]' : ''}`)
        .join('\n');

      messages.push({
        role: 'user',
        content: [
          {
            type: 'text',
            text: `【返信対象】\n${targetPost.author_id}さんの投稿: ${targetPost.content || '(画像のみ)'}\n\n【参考: 最近の会話の流れ】\n${context}\n\n上記の${targetPost.author_id}さんの投稿と画像に対して、自然に返信してください。`,
          },
          {
            type: 'image_url',
            image_url: { url: imageUrl },
          },
        ],
      });
    } else if (targetPost) {
      // 返信の場合：特定の投稿に対して返信（コンテキストを含める）
      const context = recentPosts
        .slice(0, 5)
        .reverse()
        .map((p) => `${p.author_id}: ${p.content}${p.media_url ? ' [画像あり]' : ''}`)
        .join('\n');

      userMessage = `【返信対象】\n${targetPost.author_id}さんの投稿: ${targetPost.content}\n\n【参考: 最近の会話の流れ】\n${context}\n\n上記の${targetPost.author_id}さんの投稿に対して、自然に返信してください。`;

      messages.push({ role: 'user', content: userMessage });
    } else {
      /**
       * 新しくスレッドを立てる場合。
       *
       * 以前はここで「過去の投稿は一切参照せず、完全に新しい話題を」と指示していた。
       * 板の趣旨はシステムプロンプト側に書いてあるのに、この一行が
       * 「自由に発言してください」と上書きしてしまい、板と関係のない独り言が出ていた。
       *
       * 板の様子（趣旨・既出の話題・直近の書き込み）はシステムプロンプトに
       * 積んである。ここでは、それを読んだ上で切り出すよう促すだけにする。
       */
      const context = recentPosts
        .slice(0, 8)
        .reverse()
        .map((p) => `${p.author_id}: ${p.content}${p.media_url ? ' [画像あり]' : ''}`)
        .join('\n');

      userMessage = context
        ? `【この板でいま話されていること】\n${context}\n\n` +
          `この板の趣旨の中から、まだ出ていない話題を一つ、自分から切り出してください。` +
          `既に出ている話の繰り返しにはしないこと。` +
          `直前の流れに乗った別の角度でもかまいません。`
        : `この板にはまだ書き込みがありません。` +
          `板の趣旨に沿って、最初の一行をあなたから置いてください。`;

      messages.push({ role: 'user', content: userMessage });
    }

    // 文字数の上限は後段で見る。ここでは言い切れるだけの余白を渡す。
    // 短く絞りすぎると毎回トークン上限で文が途切れる。
    const budget = Math.min(400, Math.max(80, Math.ceil(maxLength * 2.5)));

    // gpt-5 系は temperature などを受け付けず、送るとエラーで黙ってしまう。
    // 考えるぶんの出力も要るので、上限は多めに渡す。
    const tuning = isReasoningModel(model)
      ? { max_completion_tokens: budget * 4 }
      : {
          temperature,
          presence_penalty: presencePenalty,
          frequency_penalty: frequencyPenalty,
          max_tokens: budget,
        };

    const response = await openai.chat.completions.create({
      model,
      messages: messages as any,
      ...tuning,
    });

    const choice = response.choices[0];
    const content = choice?.message?.content?.trim();
    if (!content) return null;

    /**
     * ユーザーIDとコロンを除去（例: "1234: " や "AI: " など）。
     *
     * あわせてURLも落とす。
     * ここは「調べ物」を伴わない普通の書き込みなので、住人は何も見ていない。
     * 見ていないのに書かれたURLは、もっともらしい形をした作り話で、
     * 実在しないページや別の記事に飛ぶ。文章だけなら読めるので落とす。
     *
     * 実際に調べた話に出典を付ける道は別にある（lib/ai-extra.ts）。
     * そちらはAPIが返した引用先だけを使い、開けることも確かめている。
     */
    const cleanedContent = stripUrls(
      content
        .replace(/^\d+:\s*/, '')
        .replace(/^[A-Za-z]+:\s*/, '')
        .trim()
    );

    if (!cleanedContent) return null;

    // トークン上限で止められた場合は、言いかけの最後の一文を落とす。
    // 落とした結果なにも残らなければ書かない。
    if (choice?.finish_reason === 'length') {
      const settled = dropDanglingSentence(cleanedContent);
      if (!settled) {
        console.error('AI response was cut off mid-sentence. Skipping the post.');
        return null;
      }
      return trimToNaturalEnd(settled, maxLength);
    }

    // 文の途中で切らずに、設定された文字数へ寄せる
    return trimToNaturalEnd(cleanedContent, maxLength);
  } catch (error) {
    console.error('GPT API error:', error);
    // 生成に失敗したら null を返す。
    // 以前はここで「わかる」などの相槌に差し替えていたが、
    // 相槌は返信先が無くても成立してしまうぶん、文脈の無い独り言として
    // 板に残り続ける。失敗したときは書かないほうが場が荒れない。
    return null;
  }
}
