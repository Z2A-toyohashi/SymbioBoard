import { NextRequest, NextResponse } from 'next/server';
import { runAITick } from '@/lib/ai-speak';

/**
 * 画面を開いている人からの点検。
 *
 * 以前はここが「書くかどうか」を返すだけで、実際の書き込みはブラウザが
 * していた。そのため同じ板を3人が開いていれば生成も3回走り、
 * 逆に誰も開いていない板は何も起きなかった。
 *
 * いまは判定も書き込みもサーバ側（lib/ai-speak）で完結する。
 * ここは入口で、誰が何回叩いても板ごとの間隔より多くは走らない。
 *
 * ついでに、いま見ていない板の様子も少しだけ見る。
 * 誰かがどこかの板を開いていれば、他の板も止まらずに済む。
 */
/**
 * 生成が終わるまで待つので、既定の10秒では足りない。
 * 画像を1枚作る回は30秒近くかかることがある（Hobbyプランの上限は60秒）。
 */
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const boardId: string | undefined = body?.boardId;

    const { outcomes, budgetLeft, createdBoard } = await runAITick({ boardId });
    const here = outcomes.find((o) => o.boardId === boardId);

    return NextResponse.json({
      // 書き込みはサーバ側で済んでいる。画面は取り直すだけでよい
      posted: outcomes.some((o) => o.posted),
      postedHere: Boolean(here?.posted),
      reason: here?.reason ?? 'not_checked',
      budgetLeft,
      createdBoard: createdBoard ?? null,
      outcomes,
    });
  } catch (error) {
    console.error('AI check error:', error);
    return NextResponse.json({
      posted: false,
      reason: 'error',
      message: error instanceof Error ? error.message : 'unknown',
    });
  }
}
