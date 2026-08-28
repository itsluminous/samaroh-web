/**
 * Immediate-sync parity (Android sync-engine mirror): a mutation queued
 * while the browser is ONLINE fires a debounced replay right away instead of
 * sitting in the outbox until the next reconnect or app load. Offline
 * enqueues stay parked for the `online` listener; bursts collapse into a
 * single run.
 */
import 'fake-indexeddb/auto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { outboxDb } from '@/lib/outbox/db';
import { insertWithOutbox, updateWithOutbox } from '@/lib/outbox/mutate';
import {
  cancelImmediateReplay,
  enqueue,
  IMMEDIATE_REPLAY_DELAY_MS,
  OUTBOX_SYNC_STATE_EVENT,
  pendingCount,
  scheduleImmediateReplay,
} from '@/lib/outbox/outbox';

interface Call {
  op: 'insert' | 'update';
  table: string;
}

/** Fake client; `failFirstInserts` inserts fail with a fetch-level error. */
function fakeSupabase(failFirstInserts = 0) {
  const calls: Call[] = [];
  let remainingFailures = failFirstInserts;
  const client = {
    from(table: string) {
      return {
        insert() {
          calls.push({ op: 'insert', table });
          if (remainingFailures > 0) {
            remainingFailures -= 1;
            return Promise.resolve({ error: { message: 'TypeError: fetch failed' } });
          }
          return Promise.resolve({ error: null });
        },
        update() {
          return {
            eq() {
              calls.push({ op: 'update', table });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

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

/**
 * Dexie/fake-indexeddb schedule their completion callbacks on fresh timers,
 * so a fired replay may still be mid-flight when a single advance returns —
 * keep advancing fake time in small rounds (yielding to promises each round)
 * until the run settles.
 */
async function flushReplay(rounds = 20): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await jest.advanceTimersByTimeAsync(1);
  }
}

const onLine = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(navigator), 'onLine');

function setOnline(value: boolean) {
  Object.defineProperty(Object.getPrototypeOf(navigator), 'onLine', {
    configurable: true,
    get: () => value,
  });
}

beforeEach(async () => {
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'queueMicrotask', 'nextTick'] });
  await outboxDb.outbox.clear();
  await outboxDb.meta.clear();
});

afterEach(() => {
  cancelImmediateReplay();
  jest.useRealTimers();
  if (onLine) {
    Object.defineProperty(Object.getPrototypeOf(navigator), 'onLine', onLine);
  }
});

describe('scheduleImmediateReplay', () => {
  it('replays a queued item after the debounce window, not before', async () => {
    await queueCreate('a');
    const { client, calls } = fakeSupabase();
    scheduleImmediateReplay(client);
    expect(calls).toHaveLength(0); // debounced — nothing yet
    await jest.advanceTimersByTimeAsync(IMMEDIATE_REPLAY_DELAY_MS - 1);
    expect(calls).toHaveLength(0);
    await jest.advanceTimersByTimeAsync(1);
    await flushReplay();
    expect(calls.map((c) => c.op)).toEqual(['insert']);
    expect(await pendingCount()).toBe(0);
  });

  it('collapses an enqueue burst into a single replay run', async () => {
    const runs: boolean[] = [];
    const onState = () => runs.push(true);
    window.addEventListener(OUTBOX_SYNC_STATE_EVENT, onState);
    try {
      const { client, calls } = fakeSupabase();
      await queueCreate('a');
      scheduleImmediateReplay(client);
      await queueCreate('b');
      scheduleImmediateReplay(client); // resets the window
      await jest.advanceTimersByTimeAsync(IMMEDIATE_REPLAY_DELAY_MS * 3);
    await flushReplay();
      // One run (one start + one end sync-state event) applied both items.
      expect(runs).toHaveLength(2);
      expect(calls).toHaveLength(2);
      expect(await pendingCount()).toBe(0);
    } finally {
      window.removeEventListener(OUTBOX_SYNC_STATE_EVENT, onState);
    }
  });

  it('does nothing while the browser is offline (reconnect listener owns it)', async () => {
    setOnline(false);
    await queueCreate('parked');
    const { client, calls } = fakeSupabase();
    scheduleImmediateReplay(client);
    await jest.advanceTimersByTimeAsync(IMMEDIATE_REPLAY_DELAY_MS * 3);
    await flushReplay();
    expect(calls).toHaveLength(0);
    expect(await pendingCount()).toBe(1);
  });
});

describe('mutate data layer wiring', () => {
  it('insertWithOutbox retries a fetch-failure enqueue immediately', async () => {
    const { client, calls } = fakeSupabase(1); // first insert fails at fetch level
    const outcome = await insertWithOutbox(client, {
      module: 'expenses',
      table: 'expenses',
      row: { id: 'e1', amount: 10 },
      label: 'tea',
    });
    expect(outcome).toBe('queued');
    expect(calls).toHaveLength(1);
    expect(await pendingCount()).toBe(1);
    // The enqueue itself scheduled the replay — no reconnect/app load needed.
    await jest.advanceTimersByTimeAsync(IMMEDIATE_REPLAY_DELAY_MS);
    await flushReplay();
    expect(calls).toHaveLength(2);
    expect(await pendingCount()).toBe(0);
  });

  it('updateWithOutbox queued while offline does NOT self-replay', async () => {
    setOnline(false);
    const { client, calls } = fakeSupabase();
    const outcome = await updateWithOutbox(client, {
      module: 'booking',
      table: 'bookings',
      entityId: 'b1',
      patch: { notes: 'x' },
      baseUpdatedAt: null,
      label: 'b1',
    });
    expect(outcome).toBe('queued');
    await jest.advanceTimersByTimeAsync(IMMEDIATE_REPLAY_DELAY_MS * 3);
    await flushReplay();
    expect(calls).toHaveLength(0);
    expect(await pendingCount()).toBe(1);
  });
});
