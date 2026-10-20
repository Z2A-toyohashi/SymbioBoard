import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';
import { VISIT_GAP_MS, countVisits } from '@/lib/visits';

/**
 * 訪問者（人だけ）の一覧。
 *
 * これまで管理画面に出ていたのは「IDと、初回・最終の時刻」だけだった。
 * それでは「10人が1回ずつ来た」のか「1人が10回来た」のかが分からない。
 * 戻ってきているかどうかは、この場が成り立っているかの一番の目印なので、
 * ひとりずつの訪問回数を数える。
 *
 * ---------------------------------------------------------------------------
 * 「1回の訪問」の数え方は lib/visits.ts（30分空いたら次の訪問）。
 * 開いたページ数で数えると、板を5つ渡り歩いた人が5回来た扱いになる。
 *
 * この数え方の弱点は正直に画面へ出す（下の firstEventAt と truncated）。
 *   ・行動の記録を始めたのは第12次マイグレーション以降。それより前に
 *     来ていた人の訪問は数えられない（users には居るが記録が無い）
 *   ・読む記録の件数に上限を置いているので、古い訪問は入らないことがある
 * ---------------------------------------------------------------------------
 *
 * ※ 管理画面には認証が無い（既知の弱点）。この口も同じで、URLを知っていれば
 *    誰でも読める。公開する前に鍵を付けること。
 */

/** 何日ぶんを見るか（既定） */
const DEFAULT_DAYS = 30;

/** 一度に読む記録の上限。これに達したら、それより古い訪問は数えていない */
const MAX_LOGS = 20000;

interface LogRow {
  event_type: string;
  user_id: string;
  metadata: Record<string, unknown> | null;
  created_at: number;
}

export interface Visitor {
  id: string;
  /** users に行ができた時刻（＝初めて来た日） */
  created_at: number;
  last_seen: number;
  /** 直近1時間に居たか */
  active: boolean;
  /** 数えられた訪問の回数 */
  visits: number;
  /** 最後の訪問の始まり。「いつ来たか」はこちらのほうが近い */
  lastVisitAt: number | null;
  /** 記録のある最初の行動。これより前の訪問は数えられていない */
  firstEventAt: number | null;
  /** 書いた数（返信を含む） */
  posts: number;
  /** 板を開いた回数 */
  boardViews: number;
  /** 開いた板の数（別々の板） */
  boards: number;
  /** 読んでいた時間の合計（ms） */
  dwellMs: number;
  reactions: number;
  guesses: number;
}

export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const days = Math.max(1, Math.min(365, Number(params.get('days')) || DEFAULT_DAYS));
    const since = Date.now() - days * 86400000;

    const [{ data: allUsers, error: usersError }, { data: aiCharacters }, { data: logs }] =
      await Promise.all([
        supabase.from('users').select('id, created_at, last_seen'),
        supabase.from('ai_characters').select('id'),
        supabase
          .from('logs')
          .select('event_type, user_id, metadata, created_at')
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(MAX_LOGS),
      ]);

    if (usersError) throw usersError;

    // users にはAIも入っている。IDを引いて必ず差し引く
    const aiIds = new Set((aiCharacters || []).map((c) => c.id as string));
    const humans = (allUsers || []).filter((u) => !aiIds.has(u.id as string));

    const rows = ((logs || []) as LogRow[]).filter((row) => !aiIds.has(row.user_id));

    // ひとりずつの行動を、古い順に並べ直す（訪問の区切りに要る）
    const byUser = new Map<string, LogRow[]>();
    for (const row of rows) {
      const list = byUser.get(row.user_id);
      if (list) list.push(row);
      else byUser.set(row.user_id, [row]);
    }
    for (const list of byUser.values()) list.sort((a, b) => a.created_at - b.created_at);

    const activeSince = Date.now() - 3600000;

    const visitors: Visitor[] = humans.map((user) => {
      const id = user.id as string;
      const list = byUser.get(id) || [];

      // 訪問の区切りは lib/visits.ts（30分空いたら次の訪問）
      const { visits, lastVisitAt } = countVisits(list.map((row) => row.created_at));

      let posts = 0;
      let boardViews = 0;
      let dwellMs = 0;
      let reactions = 0;
      let guesses = 0;
      const boards = new Set<string>();

      for (const row of list) {
        const meta = (row.metadata || {}) as Record<string, unknown>;
        if (typeof meta.board_id === 'string') boards.add(meta.board_id);

        switch (row.event_type) {
          case 'post':
          case 'reply':
            posts++;
            break;
          case 'view_board':
            boardViews++;
            break;
          case 'leave_board':
            if (typeof meta.dwell_ms === 'number') dwellMs += meta.dwell_ms;
            break;
          case 'reaction_add':
            reactions++;
            break;
          case 'guess':
            guesses++;
            break;
        }
      }

      return {
        id,
        created_at: user.created_at as number,
        last_seen: user.last_seen as number,
        active: (user.last_seen as number) >= activeSince,
        visits,
        lastVisitAt,
        firstEventAt: list[0]?.created_at ?? null,
        posts,
        boardViews,
        boards: boards.size,
        dwellMs,
        reactions,
        guesses,
      };
    });

    // よく来ている人が上。同じ回数なら最近来た人が上
    visitors.sort((a, b) => b.visits - a.visits || b.last_seen - a.last_seen);

    return NextResponse.json({
      visitors,
      days,
      visitGapMinutes: VISIT_GAP_MS / 60000,
      /** 読んだ記録の件数。上限に達していたら古い訪問は数えていない */
      scanned: rows.length,
      truncated: (logs || []).length >= MAX_LOGS,
      totals: {
        people: visitors.length,
        active: visitors.filter((v) => v.active).length,
        returning: visitors.filter((v) => v.visits >= 2).length,
        visits: visitors.reduce((sum, v) => sum + v.visits, 0),
      },
    });
  } catch (error) {
    console.error('Failed to read visitors:', error);
    return NextResponse.json({ error: 'Failed to read visitors' }, { status: 500 });
  }
}
