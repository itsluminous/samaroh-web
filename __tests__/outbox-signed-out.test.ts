/**
 * Android ADR-089 parity: the outbox never replays as `anon`. A client whose
 * session is gone (revoked/expired refresh token) skips the run, keeps every
 * item queued (no misleading RLS "errors"), and drains on the next run once a
 * session is back.
 */
import 'fake-indexeddb/auto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { outboxDb } from '@/lib/outbox/db';
import { enqueue, hasUserSession, replayOutbox } from '@/lib/outbox/outbox';

function fakeSupabase(session: object | null) {
  const inserts: string[] = [];
  let current = session;
  const client = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: current } }),
    },
    from(table: string) {
      return {
        insert() {
          inserts.push(table);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return {
    client: client as unknown as SupabaseClient,
    inserts,
    signIn: () => {
      current = { user: { id: 'u1' } };
    },
  };
}

beforeEach(async () => {
  await outboxDb.outbox.clear();
});

test('no session: nothing is pushed, items stay queued untouched', async () => {
  const { client, inserts } = fakeSupabase(null);
  await enqueue({
    module: 'notes',
    table: 'notes',
    entityId: 'n-1',
    operation: 'create',
    payload: { id: 'n-1' },
    label: 'note',
  });

  const result = await replayOutbox(client);

  expect(result.signedOut).toBe(true);
  expect(result.applied).toBe(0);
  expect(result.errors).toBe(0);
  expect(inserts).toEqual([]);
  const items = await outboxDb.outbox.toArray();
  expect(items).toHaveLength(1);
  expect(items[0]?.status).toBe('queued');
  expect(items[0]?.last_error).toBeNull();
});

test('self-heal: the held queue drains on the first run after sign-in', async () => {
  const fake = fakeSupabase(null);
  await enqueue({
    module: 'notes',
    table: 'notes',
    entityId: 'n-2',
    operation: 'create',
    payload: { id: 'n-2' },
    label: 'note',
  });
  await replayOutbox(fake.client);
  expect(fake.inserts).toEqual([]);

  fake.signIn();
  const result = await replayOutbox(fake.client);

  expect(result.signedOut).toBe(false);
  expect(result.applied).toBe(1);
  expect(fake.inserts).toEqual(['notes']);
  expect(await outboxDb.outbox.count()).toBe(0);
});

test('hasUserSession trusts clients without an auth surface', async () => {
  expect(await hasUserSession({} as unknown as SupabaseClient)).toBe(true);
  expect(await hasUserSession(fakeSupabase(null).client)).toBe(false);
  expect(await hasUserSession(fakeSupabase({ user: {} }).client)).toBe(true);
});
