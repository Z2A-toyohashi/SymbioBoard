import OpenAI from 'openai';
import type { Post } from '@/types';

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
        content: `${systemPrompt}\n\n重要: あなたの返信は、あなた自身の発言のみを含めてください。他のユーザーIDやコロン（:）を含めないでください。自然な会話口調で短く返信してください。`,
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
      max_tokens: 100,
      presence_penalty: presencePenalty,
      frequency_penalty: frequencyPenalty,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) return null;

    // ユーザーIDとコロンを除去（例: "1234: " や "AI: " など）
    const cleanedContent = content
      .replace(/^\d+:\s*/, '')
      .replace(/^[A-Za-z]+:\s*/, '')
      .trim();

    if (!cleanedContent) return null;

    // 設定された文字数以内に制限
    return cleanedContent.slice(0, maxLength);
  } catch (error) {
    console.error('GPT API error:', error);
    // 生成に失敗したら null を返す。
    // 以前はここで「わかる」などの相槌に差し替えていたが、
    // 相槌は返信先が無くても成立してしまうぶん、文脈の無い独り言として
    // 板に残り続ける。失敗したときは書かないほうが場が荒れない。
    return null;
  }
}
