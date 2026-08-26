/**
 * Outbox semantics tests (§8, web mirror): FIFO replay, last-write-wins
 * conflicts, RLS errors kept per-item, network failures leaving the queue
 * intact, and the offline enqueue path of the mutation data layer.
 * Dexie runs on fake-indexeddb; Supabase is a scripted fake.
 */
import 'fake-indexeddb/auto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getLastSyncAt, outboxDb } from '@/lib/outbox/db';
import { insertWithOutbox } from '@/lib/outbox/mutate';
import { enqueue, listItems, pendingCount, replayOutbox } from '@/lib/outbox/outbox';

type Result = { error: { message: string; code?: string } | null };

interface FakeOptions {
  insertError?: { message: string; code?: string };
  updateError?: { message: string };
  serverUpdatedAt?: string | null;
  selectError?: { message: string };
}

interface Call {
  op: 'insert' | 'update' | 'select';
  table: string;
  payload?: unknown;
}

function fakeSupabase(options: FakeOptions = {}) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      return {
        insert(payload: unknown): Promise<Result> {
          calls.push({ op: 'insert', table, payload });
          return Promise.resolve({ error: options.insertError ?? null });
        },
        update(payload: unknown) {
          return {
            eq(): Promise<Result> {
              calls.push({ op: 'update', table, payload });
              return Promise.resolve({ error: options.updateError ?? null });
            },
          };
        },
        select() {
          return {
            eq() {
              return {
                maybeSingle() {
                  calls.push({ op: 'select', table });
                  if (options.selectError) {
                    return Promise.resolve({ data: null, error: options.selectError });
                  }
                  return Promise.resolve({
                    data: options.serverUpdatedAt ? { updated_at: options.serverUpdatedAt } : null,
                    error: null,
                  });
                },
              };
            },
          };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

beforeEach(async () => {
  await outboxDb.outbox.clear();
  await outboxDb.meta.clear();
});

function queueCreate(label: string) {
  return enqueue({
    module: 'booking',
    table: 'bookings',
    entityId: `id-${label}`,
    operation: 'create',
    payload: { id: `id-${label}` },
    label,
  });
}

describe('replayOutbox', () => {
  it('replays FIFO, clears applied items and stamps last sync', async () => {
    await queueCreate('a');
    await queueCreate('b');
    await enqueue({
      module: 'booking',
      table: 'bookings',
      entityId: 'id-a',
      operation: 'update',
      payload: { notes: 'x' },
      baseUpdatedAt: '2026-01-02T00:00:00Z',
      label: 'a',
    });
    const { client, calls } = fakeSupabase({ serverUpdatedAt: '2026-01-01T00:00:00Z' });
    const result = await replayOutbox(client);
    expect(result).toMatchObject({ applied: 3, conflicts: 0, errors: 0, offline: false });
    expect(await pendingCount()).toBe(0);
    expect(calls.map((c) => c.op)).toEqual(['insert', 'insert', 'select', 'update']);
    expect(await getLastSyncAt()).not.toBeNull();
  });

  it('treats duplicate-key inserts as already applied (idempotent retries)', async () => {
    await queueCreate('dup');
    const { client } = fakeSupabase({ insertError: { message: 'duplicate key', code: '23505' } });
    const result = await replayOutbox(client);
    expect(result.applied).toBe(1);
    expect(await pendingCount()).toBe(0);
  });

  it('keeps LWW losers as visible conflicts (never silently dropped)', async () => {
    await enqueue({
      module: 'booking',
      table: 'bookings',
      entityId: 'id-x',
      operation: 'update',
      payload: { notes: 'stale' },
      baseUpdatedAt: '2026-01-01T00:00:00Z',
      label: 'x',
    });
    const { client, calls } = fakeSupabase({ serverUpdatedAt: '2026-02-01T00:00:00Z' });
    const result = await replayOutbox(client);
    expect(result.conflicts).toBe(1);
    const items = await listItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ status: 'conflict' });
    // The stale update must never have been written to the server.
    expect(calls.some((c) => c.op === 'update')).toBe(false);
    // Conflict entries are review-only: a later replay skips them.
    const second = await replayOutbox(client);
    expect(second.conflicts).toBe(0);
    expect(await listItems()).toHaveLength(1);
  });

  it('marks server rejections as retriable errors and keeps going', async () => {
    await queueCreate('rls');
    const { client } = fakeSupabase({
      insertError: { message: 'new row violates row-level security policy' },
    });
    const result = await replayOutbox(client);
    expect(result.errors).toBe(1);
    const items = await listItems();
    expect(items[0]).toMatchObject({
      status: 'error',
      last_error: 'new row violates row-level security policy',
      attempt_count: 1,
    });
  });

  it('stops on network failure and leaves the rest queued', async () => {
    await queueCreate('one');
    await queueCreate('two');
    const { client } = fakeSupabase({ insertError: { message: 'TypeError: fetch failed' } });
    const result = await replayOutbox(client);
    expect(result.offline).toBe(true);
    expect(result.applied).toBe(0);
    expect(await pendingCount()).toBe(2);
    const items = await listItems();
    expect(items.every((i) => i.status === 'queued')).toBe(true);
  });
});

describe('insertWithOutbox (offline data layer)', () => {
  const onLine = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(navigator), 'onLine');

  afterEach(() => {
    if (onLine) {
      Object.defineProperty(Object.getPrototypeOf(navigator), 'onLine', onLine);
    }
  });

  it('queues instead of writing when the browser is offline', async () => {
    Object.defineProperty(Object.getPrototypeOf(navigator), 'onLine', {
      configurable: true,
      get: () => false,
    });
    const { client, calls } = fakeSupabase();
    const outcome = await insertWithOutbox(client, {
      module: 'expenses',
      table: 'expenses',
      row: { id: 'e1', amount: 10 },
      label: 'tea',
    });
    expect(outcome).toBe('queued');
    expect(calls).toHaveLength(0);
    expect(await pendingCount()).toBe(1);
  });

  it('writes straight through when online', async () => {
    const { client, calls } = fakeSupabase();
    const outcome = await insertWithOutbox(client, {
      module: 'expenses',
      table: 'expenses',
      row: { id: 'e2', amount: 10 },
      label: 'tea',
    });
    expect(outcome).toBe('applied');
    expect(calls).toHaveLength(1);
    expect(await pendingCount()).toBe(0);
  });

  it('falls back to the queue on a fetch-level failure', async () => {
    const { client } = fakeSupabase({ insertError: { message: 'Failed to fetch' } });
    const outcome = await insertWithOutbox(client, {
      module: 'expenses',
      table: 'expenses',
      row: { id: 'e3', amount: 10 },
      label: 'tea',
    });
    expect(outcome).toBe('queued');
    expect(await pendingCount()).toBe(1);
  });
});
