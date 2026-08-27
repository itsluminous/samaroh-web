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
import {
  isReplaying,
  listItems,
  OUTBOX_CHANGED_EVENT,
  OUTBOX_SYNC_STATE_EVENT,
  replayOutbox,
  discardItem,
} from './outbox';

export interface OutboxView {
  items: OutboxItem[];
  /** Items still waiting or retriable (excludes conflict entries kept for review). */
  pendingCount: number;
  lastSyncAt: string | null;
  online: boolean;
  /** True while any replay run is in flight — background or "Sync now". */
  syncing: boolean;
  loaded: boolean;
  syncNow: () => Promise<void>;
  discard: (seq: number) => Promise<void>;
}

export function useOutbox(supabase: SupabaseClient | null): OutboxView {
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  // Mirrors the module-level replay flag so every hook instance (app-bar
  // indicator, sync screen) animates for background replays too, not just
  // for a locally triggered "Sync now".
  const [syncing, setSyncing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    // Dexie needs IndexedDB; environments without it (jsdom without
    // fake-indexeddb) just report an empty, loaded outbox.
    if (typeof indexedDB === 'undefined') {
      setLoaded(true);
      return;
    }
    const [list, last] = await Promise.all([listItems(), getLastSyncAt()]);
    setItems(list);
    setLastSyncAt(last);
    setLoaded(true);
  }, []);

  useEffect(() => {
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
    setSyncing(isReplaying());
    void refresh();
    const onChange = () => void refresh();
    const onSyncState = () => setSyncing(isReplaying());
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener(OUTBOX_CHANGED_EVENT, onChange);
    window.addEventListener(OUTBOX_SYNC_STATE_EVENT, onSyncState);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener(OUTBOX_CHANGED_EVENT, onChange);
      window.removeEventListener(OUTBOX_SYNC_STATE_EVENT, onSyncState);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [refresh]);

  const syncNow = useCallback(async () => {
    if (!supabase) {
      return;
    }
    await replayOutbox(supabase);
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
