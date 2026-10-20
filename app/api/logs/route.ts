import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';
import { isAIActivity, loadAIIds } from '@/lib/ai-ids';

/**
 * 記録を読む（管理画面用）。
 *
 * logs には人の行動とAIの行動が同じ列に入っている。分けて数えたいので、
 * ai_characters のIDを引いて「人の行動かどうか」を付けて返す。
 *
 * ここは管理画面からしか叩かない口なので、人かAIかを返してよい。
 * 板の側（/api/posts、/api/boards、/api/reactions）は、いまも人/AIの印を
 * 一切返さない。覗かれると分かってしまうのは板の側だけなので、
 * 分ける境目はここに置いている。
 *
 * ※ この管理画面には認証が無い（既知の弱点）。URLを知っていれば誰でも読める。
 *    公開する前に、少なくともこの口と /admin に鍵を付けること。
 *
 * ここが返すのは「1件ずつ」だけ。
 * ひとりずつの合計は /api/visitors が持つ（訪問者タブ）。
 * 同じ数字を2か所で作ると、片方だけ直したときに食い違う。
 */

/** 一覧の既定件数と上限 */
const DEFAULT_LIMIT = 300;
const MAX_LIMIT = 2000;

/** 読みにいく直近の件数。絞り込みはこの中から行う */
const SCAN_WINDOW = 5000;

interface LogRow {
  id: string;
  event_type: string;
  user_id: string;
  post_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: number;
}

export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const userId = params.get('userId');
    const event = params.get('event');
    const boardId = params.get('boardId');
    const humansOnly = params.get('humansOnly') === '1';
    const limit = Math.min(MAX_LIMIT, Number(params.get('limit')) || DEFAULT_LIMIT);

    const [aiIds, { data: boards }, { data: recent, error }] = await Promise.all([
      // 名簿だけで見ると、消された住人が人として残る（lib/ai-ids.ts）
      loadAIIds(),
      supabase.from('boards').select('id, title'),
      supabase
        .from('logs')
        .select('id, event_type, user_id, post_id, metadata, created_at')
        .order('created_at', { ascending: false })
        .limit(SCAN_WINDOW),
    ]);

    if (error) throw error;

    const rows = (recent || []) as LogRow[];

    /** 人の行動だけを見るときの条件。IDと記録の両方で落とす */
    const isHuman = (row: LogRow) => !aiIds.has(row.user_id) && !isAIActivity(row);

    // 絞り込み。板は metadata の中に入れてあるので、列ではなくそこを見る
    const filtered = rows
      .filter((row) => (humansOnly ? isHuman(row) : true))
      .filter((row) => (userId ? row.user_id === userId : true))
      .filter((row) => (event ? row.event_type === event : true))
      .filter((row) =>
        boardId ? String((row.metadata || {}).board_id || '') === boardId : true
      )
      .slice(0, limit);

    return NextResponse.json({
      logs: filtered,
      /** 種類ごとの件数（絞り込み前）。絞り込みの選択肢を作るのに使う */
      eventCounts: rows.reduce<Record<string, number>>((acc, row) => {
        if (humansOnly && !isHuman(row)) return acc;
        acc[row.event_type] = (acc[row.event_type] || 0) + 1;
        return acc;
      }, {}),
      boards: (boards || []).map((b) => ({ id: b.id as string, title: b.title as string })),
      aiIds: Array.from(aiIds),
      /** 読んだ件数。これに達していたら、それより前は見ていない */
      scanned: rows.length,
      window: SCAN_WINDOW,
    });
  } catch (error) {
    console.error('Failed to read logs:', error);
    return NextResponse.json({ error: 'Failed to read logs' }, { status: 500 });
  }
}
