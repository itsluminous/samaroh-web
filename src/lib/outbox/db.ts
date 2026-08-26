/**
 * Dexie (IndexedDB) offline outbox — the web mirror of the Android sync
 * engine's outbox semantics (spec §8): every mutation made while offline is
 * queued here and replayed FIFO on reconnect with last-write-wins conflict
 * resolution on `updated_at`.
 */
import Dexie, { type EntityTable } from 'dexie';

export type OutboxOperation = 'create' | 'update' | 'delete';

/** Sections whose mutations flow through the outbox (drives grouping in UI). */
export type OutboxModule = 'booking' | 'expenses' | 'inventory';

export type OutboxStatus = 'queued' | 'error' | 'conflict';

export interface OutboxItem {
  /** Auto-increment queue position — replay is FIFO on this. */
  seq: number;
  id: string; // uuid of the outbox row itself
  module: OutboxModule;
  /** Postgres table name the payload targets. */
  table: string;
  entity_id: string;
  operation: OutboxOperation;
  /** Column map sent to Supabase (insert values or update patch). */
  payload: Record<string, unknown>;
  /**
   * For updates/deletes: the row's `updated_at` as last seen locally. If the
   * server row is newer at replay time, this op lost the LWW race and is
   * dropped as a conflict (never silently — surfaced in Sync status).
   */
  base_updated_at: string | null;
  /** Human label for the sync-status list (customer/party/item name). */
  label: string;
  attempt_count: number;
  last_error: string | null;
  status: OutboxStatus;
  created_at: string;
}

interface MetaRow {
  key: string;
  value: string;
}

const db = new Dexie('samaroh-outbox') as Dexie & {
  outbox: EntityTable<OutboxItem, 'seq'>;
  meta: EntityTable<MetaRow, 'key'>;
};

db.version(1).stores({
  outbox: '++seq, id, status, module',
  meta: 'key',
});

export const outboxDb = db;

export const LAST_SYNC_KEY = 'last_sync_at';

export async function getLastSyncAt(): Promise<string | null> {
  const row = await db.meta.get(LAST_SYNC_KEY);
  return row?.value ?? null;
}

export async function setLastSyncAt(iso: string): Promise<void> {
  await db.meta.put({ key: LAST_SYNC_KEY, value: iso });
}
