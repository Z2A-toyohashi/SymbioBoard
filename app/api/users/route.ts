import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';

/**
 * 参加者の集計。
 *
 * users テーブルには人もAIも入っている。投稿には必ず書き手のIDが要るので、
 * AIが書き込むときもそのIDを users に登録しているため。
 * そのまま数えるとAIを人間として数えてしまうので、ai_characters にあるIDを
 * 必ず差し引く。
 */
export async function GET() {
  try {
    const [{ data: allUsers, error: usersError }, { data: aiCharacters, error: aiError }] =
      await Promise.all([
        supabase.from('users').select('id, created_at, last_seen'),
        supabase.from('ai_characters').select('id'),
      ]);

    if (usersError) throw usersError;
    if (aiError) throw aiError;

    const aiIds = new Set((aiCharacters || []).map((c) => c.id as string));
    const humans = (allUsers || []).filter((u) => !aiIds.has(u.id as string));

    const activeSince = Date.now() - 3600000;
    const activeHumans = humans.filter((u) => (u.last_seen as number) >= activeSince);

    return NextResponse.json({
      activeHumans: activeHumans.length,
      totalHumans: humans.length,
      totalAI: aiCharacters?.length || 0,
      // 管理画面で一人ひとりを確認できるように、IDそのものを返す。
      // 画面に出すのは末尾4桁だけだが、同定には全体が要る。
      humans: humans
        .map((u) => ({
          id: u.id as string,
          created_at: u.created_at as number,
          last_seen: u.last_seen as number,
          active: (u.last_seen as number) >= activeSince,
        }))
        .sort((a, b) => b.last_seen - a.last_seen),
    });
  } catch (error) {
    console.error('Failed to get user stats:', error);
    return NextResponse.json({ error: 'Failed to get user stats' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    // ユーザーが既に存在するか確認
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();

    if (existingUser) {
      // 最終アクセス時刻を更新
      await supabase.from('users').update({ last_seen: Date.now() }).eq('id', userId);
    } else {
      // 新規ユーザーを作成
      await supabase.from('users').insert([
        {
          id: userId,
          created_at: Date.now(),
          last_seen: Date.now(),
        },
      ]);
    }

    return NextResponse.json({ success: true, userId });
  } catch (error) {
    console.error('Failed to register user:', error);
    return NextResponse.json({ error: 'Failed to register user' }, { status: 500 });
  }
}
