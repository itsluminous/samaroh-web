'use client';

/**
 * React view over the Dexie outbox: pending items, last-sync time and a
 * "sync now" trigger. Refreshes on the outbox change event and on browser
 * online/offline transitions (no polling).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import type { OutboxItem } from './db';
import { getLastSyncAt } from './db';
import { listItems, OUTBOX_CHANGED_EVENT, replayOutbox, discardItem } from './outbox';

export interface OutboxView {
  items: OutboxItem[];
  /** Items still waiting or retriable (excludes conflict entries kept for review). */
  pendingCount: number;
  lastSyncAt: string | null;
  online: boolean;
  syncing: boolean;
  loaded: boolean;
  syncNow: () => Promise<void>;
  discard: (seq: number) => Promise<void>;
}

export function useOutbox(supabase: SupabaseClient | null): OutboxView {
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const [list, last] = await Promise.all([listItems(), getLastSyncAt()]);
    setItems(list);
    setLastSyncAt(last);
    setLoaded(true);
  }, []);

  useEffect(() => {
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
    void refresh();
    const onChange = () => void refresh();
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener(OUTBOX_CHANGED_EVENT, onChange);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener(OUTBOX_CHANGED_EVENT, onChange);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [refresh]);

  const syncNow = useCallback(async () => {
    if (!supabase) {
      return;
    }
    setSyncing(true);
    try {
      await replayOutbox(supabase);
    } finally {
      setSyncing(false);
    }
  }, [supabase]);

  const discard = useCallback(async (seq: number) => {
    await discardItem(seq);
  }, []);

  return {
    items,
    pendingCount: items.filter((i) => i.status !== 'conflict').length,
    lastSyncAt,
    online,
    syncing,
    loaded,
    syncNow,
    discard,
  };
}
