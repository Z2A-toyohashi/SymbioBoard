import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';

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
 * 一覧（logs）は絞り込みの結果で、集計（summary）はその絞り込みに関係なく
 * 直近 SUMMARY_WINDOW 件から作る。絞り込むたびに「のべ回数」が変わると、
 * 数字を比べられない。
 */

/** 一覧の既定件数と上限 */
const DEFAULT_LIMIT = 300;
const MAX_LIMIT = 2000;

/** 集計に使う直近の件数 */
const SUMMARY_WINDOW = 5000;

interface LogRow {
  id: string;
  event_type: string;
  user_id: string;
  post_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: number;
}

export interface ActivitySummary {
  userId: string;
  isAI: boolean;
  /** 行動の回数。種類ごと */
  counts: Record<string, number>;
  total: number;
  /** 開いた板。board_id の集合 */
  boards: string[];
  /** 読んでいた時間の合計（ms）。leave_board の滞在時間を足したもの */
  dwellMs: number;
  firstAt: number;
  lastAt: number;
}

export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const userId = params.get('userId');
    const event = params.get('event');
    const boardId = params.get('boardId');
    const humansOnly = params.get('humansOnly') === '1';
    const limit = Math.min(MAX_LIMIT, Number(params.get('limit')) || DEFAULT_LIMIT);

    const [{ data: aiCharacters }, { data: boards }, { data: recent, error }] = await Promise.all([
      supabase.from('ai_characters').select('id, name'),
      supabase.from('boards').select('id, title'),
      supabase
        .from('logs')
        .select('id, event_type, user_id, post_id, metadata, created_at')
        .order('created_at', { ascending: false })
        .limit(SUMMARY_WINDOW),
    ]);

    if (error) throw error;

    const aiIds = new Set((aiCharacters || []).map((c) => c.id as string));
    const rows = (recent || []) as LogRow[];

    // 絞り込み。板は metadata の中に入れてあるので、列ではなくそこを見る
    const filtered = rows
      .filter((row) => (humansOnly ? !aiIds.has(row.user_id) : true))
      .filter((row) => (userId ? row.user_id === userId : true))
      .filter((row) => (event ? row.event_type === event : true))
      .filter((row) =>
        boardId ? String((row.metadata || {}).board_id || '') === boardId : true
      )
      .slice(0, limit);

    // 集計は絞り込み前の全体から作る（人だけ）
    const summaries = new Map<string, ActivitySummary>();
    for (const row of rows) {
      const isAI = aiIds.has(row.user_id);
      if (humansOnly && isAI) continue;

      let summary = summaries.get(row.user_id);
      if (!summary) {
        summary = {
          userId: row.user_id,
          isAI,
          counts: {},
          total: 0,
          boards: [],
          dwellMs: 0,
          firstAt: row.created_at,
          lastAt: row.created_at,
        };
        summaries.set(row.user_id, summary);
      }

      summary.counts[row.event_type] = (summary.counts[row.event_type] || 0) + 1;
      summary.total++;
      summary.firstAt = Math.min(summary.firstAt, row.created_at);
      summary.lastAt = Math.max(summary.lastAt, row.created_at);

      const meta = (row.metadata || {}) as Record<string, unknown>;
      const board = typeof meta.board_id === 'string' ? meta.board_id : null;
      if (board && !summary.boards.includes(board)) summary.boards.push(board);

      // 滞在時間。板を離れたときの記録にだけ入っている
      if (row.event_type === 'leave_board' && typeof meta.dwell_ms === 'number') {
        summary.dwellMs += meta.dwell_ms;
      }
    }

    return NextResponse.json({
      logs: filtered,
      /** 種類ごとの件数（絞り込み前） */
      eventCounts: rows.reduce<Record<string, number>>((acc, row) => {
        if (humansOnly && aiIds.has(row.user_id)) return acc;
        acc[row.event_type] = (acc[row.event_type] || 0) + 1;
        return acc;
      }, {}),
      summaries: Array.from(summaries.values()).sort((a, b) => b.lastAt - a.lastAt),
      boards: (boards || []).map((b) => ({ id: b.id as string, title: b.title as string })),
      aiIds: Array.from(aiIds),
      /** 集計に使った件数。これに達していたら、それより前は見ていない */
      scanned: rows.length,
      window: SUMMARY_WINDOW,
    });
  } catch (error) {
    console.error('Failed to read logs:', error);
    return NextResponse.json({ error: 'Failed to read logs' }, { status: 500 });
  }
}
