/**
 * Outbox queue + FIFO replay with last-write-wins semantics (spec §8).
 *
 * Replay pipeline per item, in seq order:
 * - create  → plain insert (client UUIDs make retries idempotent; a duplicate
 *             key means an earlier attempt landed → treat as success).
 * - update / delete (tombstone update) → LWW guard: if the server row's
 *   updated_at is newer than the op's base_updated_at, the op LOST the race
 *   and is kept as a visible `conflict` entry (never silently discarded).
 * - RLS / permission rejections are kept as `error` entries, retriable.
 * Network failures stop the run (remaining items stay queued for next time).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isLocalClient } from '@/lib/guest/localClient';
import type { OutboxItem, OutboxModule, OutboxOperation } from './db';
import { outboxDb, setLastSyncAt } from './db';

export interface EnqueueInput {
  module: OutboxModule;
  table: string;
  entityId: string;
  operation: OutboxOperation;
  payload: Record<string, unknown>;
  baseUpdatedAt?: string | null;
  label: string;
}

export async function enqueue(input: EnqueueInput): Promise<void> {
  await outboxDb.outbox.add({
    id: crypto.randomUUID(),
    module: input.module,
    table: input.table,
    entity_id: input.entityId,
    operation: input.operation,
    payload: input.payload,
    base_updated_at: input.baseUpdatedAt ?? null,
    label: input.label,
    attempt_count: 0,
    last_error: null,
    status: 'queued',
    created_at: new Date().toISOString(),
  } as OutboxItem);
  notifyOutboxChanged();
}

export async function pendingCount(): Promise<number> {
  return outboxDb.outbox.count();
}

export async function listItems(): Promise<OutboxItem[]> {
  return outboxDb.outbox.orderBy('seq').toArray();
}

export async function discardItem(seq: number): Promise<void> {
  await outboxDb.outbox.delete(seq);
  notifyOutboxChanged();
}

/** Message strings that indicate the network (not the server) failed. */
export function isNetworkError(message: string): boolean {
  return /fetch failed|failed to fetch|network|load failed|timeout/i.test(message);
}

export interface ReplayResult {
  applied: number;
  conflicts: number;
  errors: number;
  /** True when a network failure interrupted the run. */
  offline: boolean;
}

let replaying = false;

/**
 * Pushes queued ops FIFO. Safe to call repeatedly (re-entrancy guarded);
 * meant to run on reconnect, on app load and from the "Sync now" button.
 */
export async function replayOutbox(db: SupabaseClient): Promise<ReplayResult> {
  const result: ReplayResult = { applied: 0, conflicts: 0, errors: 0, offline: false };
  // Never replay into the guest-mode local client: queued items belong to a
  // signed-in session and must only ever land on the server. Replaying them
  // locally would dequeue (lose) them.
  if (replaying || isLocalClient(db)) {
    return result;
  }
  replaying = true;
  try {
    const items = await outboxDb.outbox.orderBy('seq').toArray();
    for (const item of items) {
      if (item.status === 'conflict') {
        continue; // kept only for user review; discard is manual
      }
      try {
        const outcome = await applyItem(db, item);
        if (outcome === 'applied') {
          await outboxDb.outbox.delete(item.seq);
          result.applied += 1;
        } else {
          await outboxDb.outbox.update(item.seq, {
            status: 'conflict',
            last_error: null,
            attempt_count: item.attempt_count + 1,
          });
          result.conflicts += 1;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isNetworkError(message)) {
          result.offline = true;
          break; // still offline — leave the rest queued
        }
        await outboxDb.outbox.update(item.seq, {
          status: 'error',
          last_error: message,
          attempt_count: item.attempt_count + 1,
        });
        result.errors += 1;
      }
    }
    if (result.applied > 0 || (!result.offline && items.length === 0)) {
      await setLastSyncAt(new Date().toISOString());
    }
    return result;
  } finally {
    replaying = false;
    notifyOutboxChanged();
  }
}

type ApplyOutcome = 'applied' | 'conflict';

async function applyItem(db: SupabaseClient, item: OutboxItem): Promise<ApplyOutcome> {
  if (item.operation === 'create') {
    const { error } = await db.from(item.table).insert(item.payload);
    if (error) {
      if (error.code === '23505') {
        return 'applied'; // duplicate key: an earlier attempt already landed
      }
      throw new Error(error.message);
    }
    return 'applied';
  }

  // update / delete: LWW guard on updated_at.
  if (item.base_updated_at) {
    const { data, error } = await db
      .from(item.table)
      .select('updated_at')
      .eq('id', item.entity_id)
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    const serverUpdatedAt = (data as { updated_at?: string } | null)?.updated_at;
    if (serverUpdatedAt && new Date(serverUpdatedAt).getTime() > new Date(item.base_updated_at).getTime()) {
      return 'conflict';
    }
  }
  const { error } = await db.from(item.table).update(item.payload).eq('id', item.entity_id);
  if (error) {
    throw new Error(error.message);
  }
  return 'applied';
}

// --- change notification (lets React hooks refresh without polling) ---

export const OUTBOX_CHANGED_EVENT = 'samaroh:outbox-changed';

export function notifyOutboxChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(OUTBOX_CHANGED_EVENT));
  }
}
