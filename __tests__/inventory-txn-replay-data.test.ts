/**
 * Transaction edit/delete data layer: mutations replay the item's live
 * history (FIFO) and rewrite remaining_quantity / derived remove costs via
 * outbox-aware updates; edits/deletes that would drive historical stock
 * negative throw HistoricalNegativeStockError and persist NOTHING.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  deleteInventoryTransaction,
  HistoricalNegativeStockError,
  updateInventoryTransaction,
} from '@/app/[locale]/(app)/inventory/_lib/queries';

interface TxnRow {
  id: string;
  transaction_type: 'add' | 'remove';
  quantity: number;
  unit_price: number;
  remaining_quantity: number;
  transaction_date: string;
  notes: string | null;
}

/** Thenable-chain fake covering the per-item fetch + update calls. */
function fakeSupabase(rows: TxnRow[]) {
  const updates: { id: unknown; patch: Record<string, unknown> }[] = [];
  const selectChain = {
    eq: () => selectChain,
    is: () => selectChain,
    order: () => Promise.resolve({ data: rows, error: null }),
  };
  const client = {
    from: () => ({
      select: () => selectChain,
      update: (patch: Record<string, unknown>) => ({
        eq: (_col: string, id: unknown) => {
          updates.push({ id, patch });
          return Promise.resolve({ error: null });
        },
      }),
    }),
  };
  return { client: client as unknown as SupabaseClient, updates };
}

function row(overrides: Partial<TxnRow> & { id: string }): TxnRow {
  return {
    transaction_type: 'add',
    quantity: 0,
    unit_price: 0,
    remaining_quantity: 0,
    transaction_date: '2026-01-01T00:00:00Z',
    notes: null,
    ...overrides,
  };
}

// a1 5@₹10 fully consumed, a2 5@₹20 partially (3 left), r1 removed 7 @ ₹12.86.
const history: TxnRow[] = [
  row({ id: 'a1', quantity: 5, unit_price: 10, remaining_quantity: 0 }),
  row({ id: 'a2', quantity: 5, unit_price: 20, remaining_quantity: 3, transaction_date: '2026-01-02T00:00:00Z' }),
  row({
    id: 'r1',
    transaction_type: 'remove',
    quantity: 7,
    unit_price: 12.86,
    remaining_quantity: 0,
    transaction_date: '2026-01-03T00:00:00Z',
  }),
];

describe('updateInventoryTransaction', () => {
  it('rewrites the edited row and every downstream FIFO column', async () => {
    const { client, updates } = fakeSupabase(history);
    // Shrink the remove 7 → 4: consumes only a1 (rem 1), a2 back to 5,
    // derived cost drops to ₹10/unit.
    await updateInventoryTransaction(client, 'b1', 'item1', 'r1', { quantity: 4, notes: 'less' }, 'Rice');
    expect(updates).toEqual([
      { id: 'r1', patch: { quantity: 4, notes: 'less', unit_price: 10 } },
      { id: 'a1', patch: { remaining_quantity: 1 } },
      { id: 'a2', patch: { remaining_quantity: 5 } },
    ]);
  });

  it('applies the user unit price on an add and reflows downstream removes', async () => {
    const { client, updates } = fakeSupabase(history);
    // Reprice a1 10 → 16: r1's FIFO cost becomes (5×16 + 2×20)/7 = ₹17.14.
    await updateInventoryTransaction(
      client,
      'b1',
      'item1',
      'a1',
      { quantity: 5, unitPrice: 16, notes: null },
      'Rice',
    );
    expect(updates).toEqual([
      { id: 'a1', patch: { quantity: 5, notes: null, unit_price: 16 } },
      { id: 'r1', patch: { unit_price: 17.14 } },
    ]);
  });

  it('rejects an edit that would drive historical stock negative, persisting nothing', async () => {
    const { client, updates } = fakeSupabase(history);
    // a1 down to 1 leaves r1 (7) uncoverable at its date (1 + 5 = 6 < 7).
    await expect(
      updateInventoryTransaction(client, 'b1', 'item1', 'a1', { quantity: 1, unitPrice: 10, notes: null }, 'Rice'),
    ).rejects.toThrow(HistoricalNegativeStockError);
    expect(updates).toEqual([]);
  });
});

describe('deleteInventoryTransaction', () => {
  it('tombstones the row and restores the lots it had consumed', async () => {
    const { client, updates } = fakeSupabase(history);
    await deleteInventoryTransaction(client, 'b1', 'item1', 'r1', 'Rice');
    // Sibling rewrites land FIRST, the tombstone last (mid-way failure safety).
    expect(updates.slice(0, 2)).toEqual([
      { id: 'a1', patch: { remaining_quantity: 5 } },
      { id: 'a2', patch: { remaining_quantity: 5 } },
    ]);
    const tombstone = updates[2]!;
    expect(tombstone.id).toBe('r1');
    expect(typeof tombstone.patch.deleted_at).toBe('string');
  });

  it('rejects deleting an add lot that later removes consumed, persisting nothing', async () => {
    const { client, updates } = fakeSupabase(history);
    await expect(deleteInventoryTransaction(client, 'b1', 'item1', 'a1', 'Rice')).rejects.toThrow(
      HistoricalNegativeStockError,
    );
    expect(updates).toEqual([]);
  });
});
