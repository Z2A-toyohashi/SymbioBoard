'use client';

/**
 * 人の行動の記録（画面側）。
 *
 * これまで logs に入っていたのは「書き込んだ」と「AIが喋った」だけだった。
 * 分析したいのは書いた結果ではなく、書くまでに何をしたかなので、
 * 読んだ・押した・見立てた・板を移った、といった跡も残す。
 *
 * 気をつけたのは次の3つ。
 *
 *   1. **記録のために画面を止めない。** 送信はすべて投げっぱなしで、
 *      失敗しても画面側は何もしない（await しても返り値を見ない）
 *   2. **離脱時の滞在時間。** タブを閉じる瞬間の通常の fetch は捨てられる。
 *      sendBeacon を先に試し、無い環境では keepalive 付きの fetch で送る
 *   3. **人かAIかの区別を持ち込まない。** ここを通るのは画面を触っている
 *      人だけなので、記録に author_type のような印は付けない。
 *      AIの行動は従来どおりサーバ側（lib/ai-speak.ts）が別の名前で残す
 *
 * 記録が落ちても画面は動く。logs に入らなかった行動は、ただ数えられないだけ。
 */

/** 残す行動の種類。増やすときは管理画面（app/admin/activity）の訳も足す */
export type ActivityEvent =
  | 'view_boards'
  | 'view_board'
  | 'leave_board'
  | 'open_thread_tail'
  | 'reaction_add'
  | 'reaction_remove'
  | 'guess'
  | 'favorite_add'
  | 'favorite_remove'
  | 'board_create'
  | 'board_close'
  | 'stamp_create'
  | 'post_delete'
  | 'reply_open';

interface ActivityPayload {
  userId?: string;
  boardId?: string | null;
  postId?: string | null;
  /** 画面から渡す細かい事情。そのまま logs.metadata に入る */
  detail?: Record<string, unknown>;
}

/**
 * 1件送る。
 *
 * userId がまだ分かっていない時（IDの発行待ち）は捨てる。
 * 誰の行動か分からない記録は、分析のときに数えようがない。
 */
export function track(event: ActivityEvent, payload: ActivityPayload = {}): void {
  if (!payload.userId) return;

  const body = JSON.stringify({
    event,
    userId: payload.userId,
    boardId: payload.boardId ?? null,
    postId: payload.postId ?? null,
    detail: payload.detail ?? null,
    at: Date.now(),
  });

  try {
    fetch('/api/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // 通信が始められない環境でも、画面側は何も変えない
  }
}

/**
 * 画面を離れる瞬間に送る。
 *
 * 普通の fetch はタブが閉じる途中で打ち切られることがある。
 * sendBeacon はブラウザが代わりに送り切ってくれるので、滞在時間はこちらで送る。
 */
export function trackOnLeave(event: ActivityEvent, payload: ActivityPayload = {}): void {
  if (!payload.userId) return;

  const body = JSON.stringify({
    event,
    userId: payload.userId,
    boardId: payload.boardId ?? null,
    postId: payload.postId ?? null,
    detail: payload.detail ?? null,
    at: Date.now(),
  });

  try {
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon('/api/activity', blob)) return;
    }
    fetch('/api/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // 落ちても滞在時間が1件欠けるだけ
  }
}
