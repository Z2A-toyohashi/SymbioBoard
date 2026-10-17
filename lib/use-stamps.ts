'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Stamp } from './stamps';

export interface OwnedStamp {
  stamp_id: string;
  use_count: number;
  last_used_at: number | null;
  acquired_at: number;
}

/**
 * スタンプ台帳と、自分の持ち物。
 *
 * スタンプは数が少なく、板をまたいで共通なので、
 * レスごとに取りにいかず、画面に1回だけ読み込んで使い回す。
 *
 * 持ち物は押すたびに増えるので、押したあとに reload() を呼ぶ。
 */
export function useStampBook(userId?: string) {
  const [stamps, setStamps] = useState<Record<string, Stamp>>({});
  const [owned, setOwned] = useState<Record<string, OwnedStamp>>({});
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const url = userId ? `/api/stamps?userId=${encodeURIComponent(userId)}` : '/api/stamps';
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as { stamps?: Stamp[]; owned?: OwnedStamp[] };

        const nextStamps: Record<string, Stamp> = {};
        for (const stamp of data.stamps || []) nextStamps[stamp.id] = stamp;

        const nextOwned: Record<string, OwnedStamp> = {};
        for (const row of data.owned || []) nextOwned[row.stamp_id] = row;

        setStamps(nextStamps);
        setOwned(nextOwned);
      }
    } catch (error) {
      console.error('Failed to load stamps:', error);
    }
    setLoaded(true);
  }, [userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { stamps, owned, loaded, reload };
}
