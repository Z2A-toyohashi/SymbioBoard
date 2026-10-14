import { NextRequest, NextResponse } from 'next/server';
import type { Post } from '@/types';
import { detectSpaceState } from '@/lib/ai-logic';
import { generateAIResponseWithGPT } from '@/lib/gpt';
import { supabase } from '@/lib/supabase-client';
import { shouldAIReact, selectRandomEmoji, getActiveAICharacters } from '@/lib/ai-manager';
import { ensureAIPopulation } from '@/lib/ai-population';

export async function POST(request: NextRequest) {
  try {
    const { posts, boardId }: { posts: Post[]; boardId?: string } = await request.json();

    // AI設定を取得
    const { data: settings } = await supabase
      .from('ai_settings')
      .select('*')
      .eq('id', 'default')
      .single();

    console.log('=== AI Settings Debug ===');
    console.log('Settings from DB:', settings);
    console.log('System Prompt:', settings?.system_prompt);
    console.log('========================');

    const config = settings || {
      cooldown_min: 300000,
      cooldown_max: 900000,
      max_ai_density: 0.2,
      prob_flow: 0.0,
      prob_silence: 0.35,
      prob_fragile: 0.15,
      prob_solo: 0.5,
      system_prompt: 'あなたは自然な会話口調で短く返信してください。',
    };

    const aiPosts = posts.filter((p) => p.author_type === 'ai');
    const state = detectSpaceState(posts);

    // アクティブユーザー数を取得
    const { data: users } = await supabase
      .from('users')
      .select('id')
      .gte('last_seen', Date.now() - 3600000); // 1時間以内にアクティブ

    const userCount = users?.length || 1;

    // 人数に見合うだけAIを住まわせる（足りなければ増やす）
    await ensureAIPopulation(config, userCount);

    // 全AIキャラクターを取得
    const { data: allAICharacters } = await supabase.from('ai_characters').select('*').order('id');

    if (!allAICharacters || allAICharacters.length === 0) {
      return NextResponse.json({ shouldPost: false, reason: 'No AI characters available' });
    }

    // 住人の数自体がユーザー数に連動するようになったため、ここでの間引きはしない
    const activeAIs = allAICharacters;

    // 各AIのクールダウンをチェックして、投稿可能なAIを選択
    const now = Date.now();
    const eligibleAIs = activeAIs.filter((ai) => {
      const lastPostTime = ai.last_post_time || 0;
      const postFrequency = ai.post_frequency || 1.0;

      // 基本クールダウン時間を計算
      const baseCooldown =
        config.cooldown_min + Math.random() * (config.cooldown_max - config.cooldown_min);

      // 投稿頻度で調整（頻度が高いほどクールダウンが短い）
      const adjustedCooldown = baseCooldown / postFrequency;

      const timeSinceLastPost = now - lastPostTime;

      console.log(
        `AI ${ai.id}: last=${lastPostTime}, freq=${postFrequency}, cooldown=${adjustedCooldown}, elapsed=${timeSinceLastPost}`
      );

      return timeSinceLastPost >= adjustedCooldown;
    });

    if (eligibleAIs.length === 0) {
      return NextResponse.json({ shouldPost: false, reason: 'All AIs in cooldown' });
    }

    // ランダムに1つのAIを選択
    const aiCharacter = eligibleAIs[Math.floor(Math.random() * eligibleAIs.length)];

    // 板の話題に沿わせる。板ごとに住人の話す内容が変わらないと、板を分ける意味がないため。
    let boardSystemPrompt = aiCharacter.system_prompt;
    if (boardId) {
      const { data: board } = await supabase
        .from('boards')
        .select('title, description')
        .eq('id', boardId)
        .single();
      if (board) {
        boardSystemPrompt = [
          aiCharacter.system_prompt,
          '',
          `いまあなたがいるのは「${board.title}」という板です。`,
          board.description ? `板の説明: ${board.description}` : '',
          'この板の話題から外れないように発言してください。',
        ]
          .filter(Boolean)
          .join('\n');
      }
    }

    // AI密度チェック（設定値を使用）
    if (posts.length > 0 && aiPosts.length / posts.length > config.max_ai_density) {
      return NextResponse.json({ shouldPost: false });
    }

    // 確率的介入（設定値を使用）
    const probabilities: Record<string, number> = {
      FLOW: config.prob_flow,
      SILENCE: config.prob_silence,
      FRAGILE: config.prob_fragile,
      SOLO: config.prob_solo,
    };

    const probability = probabilities[state] || 0;
    if (Math.random() >= probability) {
      return NextResponse.json({ shouldPost: false });
    }

    const lastPost = posts[0];

    // 返信先を決定（より明確な基準で）
    let thread_id = null;
    let targetPost = undefined;
    let shouldReply = false;

    if (state === 'SOLO') {
      // SOLOの場合は高確率で返信
      shouldReply = Math.random() < 0.8;
    } else if (state === 'FRAGILE') {
      // FRAGILEの場合は中確率で返信
      shouldReply = Math.random() < 0.4;
    } else if (state === 'SILENCE') {
      // SILENCEの場合は低確率で返信（新しい話題を提供）
      shouldReply = Math.random() < 0.2;
    } else if (state === 'FLOW') {
      // FLOWの場合はほぼ返信しない（新しい話題を提供）
      shouldReply = Math.random() < 0.1;
    }

    if (shouldReply && lastPost) {
      // 返信する場合：lastPostが返信ならルート投稿に、そうでなければlastPostに返信
      thread_id = lastPost.thread_id || lastPost.id;
      targetPost = lastPost;
    }
    // shouldReply=falseの場合、thread_id=null で新規投稿（新しい話題）

    // ニュース取得チェック（新規投稿時のみ、画像生成より優先）
    let generatedImageUrl: string | undefined;
    let content: string | null;
    let isNewsPost = false;

    if (!thread_id && aiCharacter.can_fetch_news) {
      const shouldFetchNews = Math.random() < (aiCharacter.news_fetch_probability || 0.1);

      if (shouldFetchNews) {
        console.log('=== AI News Fetch Triggered ===');
        console.log('AI:', aiCharacter.name);

        try {
          const newsResponse = await fetch(
            `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/fetch-news`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ aiCharacterId: aiCharacter.id }),
            }
          );

          if (newsResponse.ok) {
            const newsData = await newsResponse.json();
            content = newsData.comment;
            isNewsPost = true;
            console.log('News fetched successfully');
            console.log('Topic:', newsData.topic);
            console.log('Comment:', content);
          } else {
            console.error('News fetch failed, falling back to normal post');
            // フォールバック：通常の投稿
            content = await generateAIResponseWithGPT(
              boardSystemPrompt,
              posts,
              targetPost,
              config.max_response_length || 30,
              config.gpt_temperature || 1.0,
              config.gpt_presence_penalty || 0.6,
              config.gpt_frequency_penalty || 0.6
            );
          }
        } catch (error) {
          console.error('News fetch error:', error);
          // フォールバック：通常の投稿
          content = await generateAIResponseWithGPT(
            boardSystemPrompt,
            posts,
            targetPost,
            config.max_response_length || 30,
            config.gpt_temperature || 1.0,
            config.gpt_presence_penalty || 0.6,
            config.gpt_frequency_penalty || 0.6
          );
        }
      } else {
        // ニュースも画像も生成しない場合、通常のテキスト投稿
        content = await generateAIResponseWithGPT(
          boardSystemPrompt,
          posts,
          targetPost,
          config.max_response_length || 30,
          config.gpt_temperature || 1.0,
          config.gpt_presence_penalty || 0.6,
          config.gpt_frequency_penalty || 0.6
        );
      }
    } else if (!thread_id && aiCharacter.can_generate_images) {
      // ニュース機能がない場合、画像生成をチェック
      const shouldGenerateImage =
        Math.random() < (aiCharacter.image_generation_probability || 0.05);

      if (shouldGenerateImage) {
        console.log('=== AI Image Generation Triggered ===');
        console.log('AI:', aiCharacter.name);

        try {
          const imageGenResponse = await fetch(
            `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/generate-image`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ aiCharacterId: aiCharacter.id }),
            }
          );

          if (imageGenResponse.ok) {
            const imageData = await imageGenResponse.json();
            generatedImageUrl = imageData.imageUrl;
            content = imageData.comment;
            console.log('Image generated successfully:', generatedImageUrl);
            console.log('Comment:', content);
          } else {
            console.error('Image generation failed, falling back to text');
            // フォールバック：通常のテキスト投稿
            content = await generateAIResponseWithGPT(
              boardSystemPrompt,
              posts,
              targetPost,
              config.max_response_length || 30,
              config.gpt_temperature || 1.0,
              config.gpt_presence_penalty || 0.6,
              config.gpt_frequency_penalty || 0.6
            );
          }
        } catch (error) {
          console.error('Image generation error:', error);
          // フォールバック：通常のテキスト投稿
          content = await generateAIResponseWithGPT(
            boardSystemPrompt,
            posts,
            targetPost,
            config.max_response_length || 30,
            config.gpt_temperature || 1.0,
            config.gpt_presence_penalty || 0.6,
            config.gpt_frequency_penalty || 0.6
          );
        }
      } else {
        // 通常のテキスト投稿
        content = await generateAIResponseWithGPT(
          boardSystemPrompt,
          posts,
          targetPost,
          config.max_response_length || 30,
          config.gpt_temperature || 1.0,
          config.gpt_presence_penalty || 0.6,
          config.gpt_frequency_penalty || 0.6
        );
      }
    } else {
      // 返信の場合は通常のテキスト投稿
      content = await generateAIResponseWithGPT(
        boardSystemPrompt,
        posts,
        targetPost,
        config.max_response_length || 30,
        config.gpt_temperature || 1.0,
        config.gpt_presence_penalty || 0.6,
        config.gpt_frequency_penalty || 0.6
      );
    }

    // 生成に失敗したときは書かない。
    // 中身の無い相槌を板に残すより、黙っているほうが場が保たれる。
    if (!content || !content.trim()) {
      console.error('AI generation returned nothing. Skipping the post.');
      return NextResponse.json({ shouldPost: false, reason: 'generation_failed' });
    }

    // GPTで応答を生成（AIキャラクターのプロンプトを使用）
    console.log('=== AI Response Generation ===');
    console.log('Selected AI:', aiCharacter.id, aiCharacter.name);
    console.log('Should reply:', !!thread_id);
    console.log('Target post:', targetPost?.content);
    console.log('Thread ID:', thread_id);
    console.log('Has generated image:', !!generatedImageUrl);
    console.log('Is news post:', isNewsPost);
    console.log('==============================');

    // AIの最終投稿時刻を更新
    await supabase.from('ai_characters').update({ last_post_time: now }).eq('id', aiCharacter.id);

    // AI介入ログを記録
    await supabase.from('logs').insert([
      {
        event_type: 'ai_intervention',
        user_id: aiCharacter.id,
        post_id: lastPost?.id || null,
        metadata: {
          state,
          content,
          is_reply: !!thread_id,
          used_gpt: true,
          has_image: !!targetPost?.media_url,
          has_generated_image: !!generatedImageUrl,
          is_news_post: isNewsPost,
          probability,
          ai_character: aiCharacter.name,
          post_frequency: aiCharacter.post_frequency,
        },
        created_at: Date.now(),
      },
    ]);

    // AIリアクションの処理
    if (shouldAIReact(state) && lastPost) {
      const reactingAIs = await getActiveAICharacters(userCount);
      const reactCount = Math.floor(Math.random() * Math.min(2, reactingAIs.length)) + 1;

      for (let i = 0; i < reactCount; i++) {
        const reactingAI = reactingAIs[Math.floor(Math.random() * reactingAIs.length)];
        const emoji = selectRandomEmoji();

        // リアクションを追加（重複チェックはAPI側で行う）
        await fetch(
          `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/reactions`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              postId: lastPost.id,
              userId: reactingAI.id,
              emoji,
            }),
          }
        ).catch((err) => console.error('AI reaction failed:', err));
      }
    }

    return NextResponse.json({
      shouldPost: true,
      content,
      thread_id,
      ai_id: aiCharacter.id,
      media_url: generatedImageUrl,
    });
  } catch (error) {
    console.error('AI check error:', error);
    return NextResponse.json({ shouldPost: false });
  }
}
