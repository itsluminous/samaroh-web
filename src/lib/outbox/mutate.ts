/**
 * Offline-aware write helpers — the data layer between UI mutations and
 * Supabase (spec §8, web mirror). Online, the write goes straight through;
 * when the network is down (`navigator.onLine === false` or a fetch-level
 * failure) the op is queued in the Dexie outbox instead and replayed FIFO on
 * reconnect. Callers get `queued` back so they can treat the write as
 * optimistically applied.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OutboxModule } from './db';
import { enqueue, isNetworkError } from './outbox';

export type WriteOutcome = 'applied' | 'queued';

function browserSaysOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export interface InsertSpec {
  module: OutboxModule;
  /** Postgres table name. */
  table: string;
  /** Full column map — MUST include a client-generated `id` uuid. */
  row: Record<string, unknown>;
  /** Human label for the sync-status list. */
  label: string;
}

/**
 * Inserts a row, falling back to the outbox when offline. The row must carry
 * a client UUID so the eventual replay (and any retry) is idempotent.
 */
export async function insertWithOutbox(db: SupabaseClient, spec: InsertSpec): Promise<WriteOutcome> {
  const queue = () =>
    enqueue({
      module: spec.module,
      table: spec.table,
      entityId: String(spec.row.id),
      operation: 'create',
      payload: spec.row,
      label: spec.label,
    });
  if (browserSaysOffline()) {
    await queue();
    return 'queued';
  }
  const { error } = await db.from(spec.table).insert(spec.row);
  if (error) {
    if (isNetworkError(error.message)) {
      await queue();
      return 'queued';
    }
    throw new Error(error.message);
  }
  return 'applied';
}

export interface UpdateSpec {
  module: OutboxModule;
  table: string;
  entityId: string;
  /** Column patch to apply. */
  patch: Record<string, unknown>;
  /**
   * The row's `updated_at` as last seen locally — drives the last-write-wins
   * guard at replay time. Pass null when unknown (replay applies blindly).
   */
  baseUpdatedAt: string | null;
  label: string;
}

/** Updates a row (including tombstone deletes), falling back to the outbox when offline. */
export async function updateWithOutbox(db: SupabaseClient, spec: UpdateSpec): Promise<WriteOutcome> {
  const isDelete = 'deleted_at' in spec.patch && spec.patch.deleted_at != null;
  const queue = () =>
    enqueue({
      module: spec.module,
      table: spec.table,
      entityId: spec.entityId,
      operation: isDelete ? 'delete' : 'update',
      payload: spec.patch,
      baseUpdatedAt: spec.baseUpdatedAt,
      label: spec.label,
    });
  if (browserSaysOffline()) {
    await queue();
    return 'queued';
  }
  const { error } = await db.from(spec.table).update(spec.patch).eq('id', spec.entityId);
  if (error) {
    if (isNetworkError(error.message)) {
      await queue();
      return 'queued';
    }
    throw new Error(error.message);
  }
  return 'applied';
}
