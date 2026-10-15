import OpenAI from 'openai';
import type { Post } from '@/types';
import { dropDanglingSentence, trimToNaturalEnd } from './text';

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
  frequencyPenalty: number = 0.6
): Promise<string | null> {
  try {
    // 画像があるかチェック
    const hasImage = targetPost?.media_url;
    const model = hasImage ? 'gpt-4o-mini' : 'gpt-4o-mini';

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
      // 新規投稿の場合：完全に新しい話題を提供（過去の投稿は一切参照しない）
      userMessage = `あなたの性格や興味に基づいて、完全に新しい話題でつぶやいてください。日常の出来事、感じたこと、考えたことなど、自由に発言してください。`;

      messages.push({ role: 'user', content: userMessage });
    }

    const response = await openai.chat.completions.create({
      model,
      messages: messages as any,
      temperature: temperature,
      // 文字数の上限は後段で見る。ここでは言い切れるだけの余白を渡す。
      // 短く絞りすぎると毎回トークン上限で文が途切れる。
      max_tokens: Math.min(400, Math.max(80, Math.ceil(maxLength * 2.5))),
      presence_penalty: presencePenalty,
      frequency_penalty: frequencyPenalty,
    });

    const choice = response.choices[0];
    const content = choice?.message?.content?.trim();
    if (!content) return null;

    // ユーザーIDとコロンを除去（例: "1234: " や "AI: " など）
    const cleanedContent = content
      .replace(/^\d+:\s*/, '')
      .replace(/^[A-Za-z]+:\s*/, '')
      .trim();

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
