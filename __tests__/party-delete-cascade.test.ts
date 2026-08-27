/**
 * Party delete cascade (spec §4.2 party management): deleting a party
 * tombstones the party AND every live expense + expense attachment under it
 * with one shared `deleted_at`.
 *
 * Covered here:
 *  - guest/Dexie mode: the cascade lands directly in the local store and the
 *    party disappears from the list queries, other parties untouched;
 *  - offline signed-in mode: every tombstone is queued as an outbox delete
 *    payload (children first, party last) instead of hitting the server.
 */
import 'fake-indexeddb/auto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createLocalClient } from '@/lib/guest/localClient';
import { guestDb, localTable } from '@/lib/guest/localDb';
import { outboxDb } from '@/lib/outbox/db';
import { listItems } from '@/lib/outbox/outbox';
import {
  deleteParty,
  fetchParties,
  fetchParty,
  fetchPartyExpenses,
  type PartyRecord,
} from '@/app/[locale]/(app)/expenses/_lib/queries';

function party(id: string, name: string): PartyRecord {
  return { id, name, phone: null, business_related: true, created_at: '2026-01-01T00:00:00Z' };
}

/** Non-null local table accessor — all names here are registered tables. */
function tbl(name: string) {
  const table = localTable(name);
  if (!table) {
    throw new Error(`unknown local table ${name}`);
  }
  return table;
}

async function seedGuestLedger(client: SupabaseClient) {
  await client.from('parties').insert([
    { id: 'p1', business_id: 'b1', name: 'Tent House', phone: null, business_related: true },
    { id: 'p2', business_id: 'b1', name: 'Caterer', phone: null, business_related: true },
  ]);
  await client.from('expenses').insert([
    { id: 'e1', business_id: 'b1', party_id: 'p1', direction: 'paid', amount: 500, expense_date: '2026-01-10' },
    { id: 'e2', business_id: 'b1', party_id: 'p1', direction: 'received', amount: 200, expense_date: '2026-01-12' },
    { id: 'e3', business_id: 'b1', party_id: 'p2', direction: 'paid', amount: 900, expense_date: '2026-01-15' },
  ]);
  await client.from('expense_attachments').insert([
    { id: 'a1', business_id: 'b1', expense_id: 'e1', drive_file_id: null, mime_type: 'image/jpeg', file_name: 'bill1.jpg', deleted_at: null },
    { id: 'a2', business_id: 'b1', expense_id: 'e1', drive_file_id: 'drv2', mime_type: 'image/jpeg', file_name: 'bill2.jpg', deleted_at: null },
    { id: 'a3', business_id: 'b1', expense_id: 'e3', drive_file_id: null, mime_type: 'image/jpeg', file_name: 'other.jpg', deleted_at: null },
  ]);
}

describe('deleteParty in guest (Dexie) mode', () => {
  const client = createLocalClient();

  beforeEach(async () => {
    await Promise.all(guestDb.tables.map((t) => t.clear()));
    await seedGuestLedger(client);
  });

  it('tombstones the party, its expenses and their attachments in one cascade', async () => {
    await deleteParty(client, party('p1', 'Tent House'));

    const parties = await tbl('parties').toArray();
    const expenses = await tbl('expenses').toArray();
    const attachments = await tbl('expense_attachments').toArray();
    const byId = <T extends { id?: unknown }>(rows: T[], id: string) =>
      rows.find((r) => r.id === id) as Record<string, unknown>;

    expect(byId(parties, 'p1').deleted_at).toEqual(expect.any(String));
    expect(byId(expenses, 'e1').deleted_at).toEqual(expect.any(String));
    expect(byId(expenses, 'e2').deleted_at).toEqual(expect.any(String));
    expect(byId(attachments, 'a1').deleted_at).toEqual(expect.any(String));
    expect(byId(attachments, 'a2').deleted_at).toEqual(expect.any(String));

    // Everything in the cascade shares the same tombstone timestamp.
    expect(byId(expenses, 'e1').deleted_at).toBe(byId(parties, 'p1').deleted_at);
    expect(byId(attachments, 'a1').deleted_at).toBe(byId(parties, 'p1').deleted_at);

    // The other party's ledger is untouched.
    expect(byId(parties, 'p2').deleted_at ?? null).toBeNull();
    expect(byId(expenses, 'e3').deleted_at ?? null).toBeNull();
    expect(byId(attachments, 'a3').deleted_at ?? null).toBeNull();
  });

  it('hides the deleted party and its ledger from the read queries', async () => {
    await deleteParty(client, party('p1', 'Tent House'));

    const parties = await fetchParties(client, 'b1');
    expect(parties.map((p) => p.name)).toEqual(['Caterer']);
    expect(await fetchParty(client, 'p1')).toBeNull();
    expect(await fetchPartyExpenses(client, 'p1')).toEqual([]);
  });

  it('is idempotent for already-tombstoned children (second delete is a no-op cascade)', async () => {
    await deleteParty(client, party('p1', 'Tent House'));
    const first = (await tbl('parties').get('p1')) as Record<string, unknown>;
    await deleteParty(client, party('p1', 'Tent House'));
    const second = (await tbl('expenses').get('e1')) as Record<string, unknown>;
    // Children were already dead — the cascade select finds no live expenses,
    // so their tombstones keep the original timestamp.
    expect(second.deleted_at).toBe(first.deleted_at);
  });
});

describe('deleteParty offline (outbox delete payloads)', () => {
  const onLine = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(navigator), 'onLine');

  afterEach(() => {
    if (onLine) {
      Object.defineProperty(Object.getPrototypeOf(navigator), 'onLine', onLine);
    }
  });

  beforeEach(async () => {
    await Promise.all([outboxDb.outbox.clear(), outboxDb.meta.clear()]);
  });

  it('queues child-first delete ops for attachments, expenses, then the party', async () => {
    Object.defineProperty(Object.getPrototypeOf(navigator), 'onLine', {
      configurable: true,
      get: () => false,
    });

    const updates: { table: string }[] = [];
    // Scripted remote-shaped client: reads still work offline (cached/failing
    // reads are the screen's concern); updates must never be attempted.
    const client = {
      from(table: string) {
        return {
          select() {
            return {
              eq() {
                return {
                  is() {
                    return Promise.resolve({
                      data: [
                        {
                          id: 'e1',
                          expense_attachments: [
                            { id: 'a1', deleted_at: null },
                            { id: 'a2', deleted_at: '2026-01-01T00:00:00Z' },
                          ],
                        },
                        { id: 'e2', expense_attachments: [] },
                      ],
                      error: null,
                    });
                  },
                };
              },
            };
          },
          update() {
            updates.push({ table });
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      },
    } as unknown as SupabaseClient;

    await deleteParty(client, party('p1', 'Tent House'));

    expect(updates).toHaveLength(0);
    const items = await listItems();
    expect(items.map((i) => [i.table, i.entity_id, i.operation])).toEqual([
      ['expense_attachments', 'a1', 'delete'], // a2 already tombstoned — skipped
      ['expenses', 'e1', 'delete'],
      ['expenses', 'e2', 'delete'],
      ['parties', 'p1', 'delete'],
    ]);
    for (const item of items) {
      expect(item.module).toBe('expenses');
      expect(item.payload.deleted_at).toEqual(expect.any(String));
      expect(item.label).toBe('Tent House');
    }
    // Expense and party tombstones bump updated_at for the LWW replay guard.
    const expenseItem = items.find((i) => i.table === 'expenses');
    const partyItem = items.find((i) => i.table === 'parties');
    expect(expenseItem?.payload.updated_at).toEqual(expect.any(String));
    expect(partyItem?.payload.updated_at).toEqual(expect.any(String));
  });
});
