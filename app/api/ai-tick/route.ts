import { NextRequest, NextResponse } from 'next/server';
import { loadAIConfig, pickDueBoards, remainingBudget, speakOnBoard } from '@/lib/ai-speak';

/**
 * 誰も見ていない時間帯のための定期実行。
 *
 * 閲覧者からの点検（/api/ai-check）だけだと、全員が寝ている間は
 * どの板も止まる。朝いちばんに開いた板が昨日のまま、というのを避ける。
 *
 * Vercel Cron から叩かれる想定（vercel.json 参照）。
 * 外から無制限に叩かれると費用に直結するので、CRON_SECRET で閉じる。
 * 1回で見るのは数板だけ。1日の生成上限は /api/ai-check と共通。
 */
const MAX_BOARDS_PER_TICK = 3;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    const given = new URL(request.url).searchParams.get('secret');
    if (auth !== `Bearer ${secret}` && given !== secret) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  try {
    const config = await loadAIConfig();
    let budgetLeft = await remainingBudget(config);

    if (budgetLeft <= 0) {
      return NextResponse.json({ checked: 0, posted: 0, reason: 'daily_budget_reached' });
    }

    const boards = await pickDueBoards(MAX_BOARDS_PER_TICK);
    const outcomes = [];

    for (const boardId of boards) {
      if (budgetLeft <= 0) break;
      const outcome = await speakOnBoard(boardId, config);
      outcomes.push(outcome);
      if (outcome.posted) budgetLeft--;
    }

    return NextResponse.json({
      checked: outcomes.length,
      posted: outcomes.filter((o) => o.posted).length,
      budgetLeft,
      outcomes,
    });
  } catch (error) {
    console.error('AI tick error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'unknown' },
      { status: 500 }
    );
  }
}
