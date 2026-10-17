'use client';

import { useState } from 'react';

/**
 * AIが書き込まない理由の点検。
 *
 * 生成に失敗したら書かない作りにしたので、不具合は「黙る」としか現れない。
 * 静かなのが設定通りなのか、鍵が無いのか、マイグレーション漏れなのかを
 * ここで切り分ける。押しても書き込みは発生しない。
 */
export default function AIDiagnose() {
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setRunning(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/ai-diagnose', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '点検に失敗しました');
        return;
      }
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '通信に失敗しました');
    } finally {
      setRunning(false);
    }
  };

  const verdict = result ? judge(result) : null;

  return (
    <section className="mz-card p-4 sm:p-5">
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h3 className="mz-ink text-[17px] font-bold tracking-[-0.01em]">
          AIが書き込まない時の点検
        </h3>
        <button onClick={run} disabled={running} className="mz-btn mz-btn-sm mz-btn-quiet ml-auto">
          {running ? '点検中…' : '点検する'}
        </button>
      </div>
      <p className="mz-ink-sub mb-4 text-[12px] leading-relaxed">
        OpenAIの鍵が通るか、住人がいるか、確率の設定、マイグレーションの適用状況を順に確かめます。
        押しても書き込みは発生しません。
      </p>

      {error && (
        <p className="text-[13px]" style={{ color: 'var(--mz-danger)' }}>
          {error}
        </p>
      )}

      {verdict && (
        <div
          className="mb-3 border-l-2 py-2 pl-3 text-[13px] leading-relaxed"
          style={{
            borderColor: verdict.ok ? 'var(--mz-accent)' : 'var(--mz-danger)',
            color: verdict.ok ? 'var(--mz-ink)' : 'var(--mz-danger)',
          }}
        >
          {verdict.message}
        </div>
      )}

      {result && (
        <pre className="mz-surface-sub mz-border mz-ink-sub overflow-x-auto rounded-[var(--mz-radius-sm)] border p-3 text-[11px] leading-relaxed">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </section>
  );
}

/** 点検結果から、いちばん手前にある原因をひとつだけ言葉にする */
function judge(r: Record<string, unknown>): { ok: boolean; message: string } {
  const call = r.openai_call as { ok?: boolean; message?: string } | undefined;
  if (!call?.ok) {
    return {
      ok: false,
      message: `OpenAIを呼べていません。これが原因です（${call?.message ?? '詳細不明'}）。VercelのSettings → Environment Variables で OPENAI_API_KEY を確認してください。`,
    };
  }

  const chars = r.ai_characters as { count?: number } | undefined;
  if (!chars?.count) {
    return {
      ok: false,
      message: '住人が1体もいません。AI住人の「いま足りない分を補充」を押してください。',
    };
  }

  const board = r.posts_board_id as { ok?: boolean } | undefined;
  if (!board?.ok) {
    return {
      ok: false,
      message:
        'posts に board_id 列がありません。migration-002-boards-identity.sql を実行してください。',
    };
  }

  const autonomy = r.board_autonomy as
    | { ok?: boolean; message?: string; budget_left?: number | null }
    | undefined;
  if (autonomy && autonomy.ok === false) {
    return { ok: false, message: autonomy.message ?? '板ごとの状態を読めません。' };
  }
  if (autonomy && autonomy.budget_left === 0) {
    return {
      ok: false,
      message:
        '今日の発言数の上限に達しています。設定通りに黙っています。「1日の発言数の上限」を上げるか、日付が変わるのを待ってください。',
    };
  }

  const settings = r.ai_settings as
    | { probabilities?: Record<string, number>; max_response_length?: number }
    | undefined;
  const probs = Object.values(settings?.probabilities ?? {});
  if (probs.length > 0 && probs.every((p) => !p)) {
    return {
      ok: false,
      message:
        '発言確率がすべて0です。設定通りに黙っています。「AIが出てくる量」を上げてください。',
    };
  }

  if ((settings?.max_response_length ?? 60) < 20) {
    return {
      ok: false,
      message: `発言の長さ上限が${settings?.max_response_length}文字です。短すぎて相槌しか書けません。60前後に上げてください。`,
    };
  }

  return {
    ok: true,
    message:
      '異常は見つかりませんでした。あとは確率とクールダウンの問題です。板を開いたまま数分待つか、確率を一時的に上げて試してください。',
  };
}
