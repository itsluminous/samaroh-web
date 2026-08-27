// recordRemoveTransaction returns the FIFO cost of the removed quantity so
// the UI can surface it in the success feedback (weighted across lots).

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  InsufficientStockError,
  recordRemoveTransaction,
} from '@/app/[locale]/(app)/inventory/_lib/queries';

interface LotRow {
  id: string;
  remaining_quantity: number;
  unit_price: number;
  transaction_date: string;
}

/** Minimal thenable-chain fake for the remove flow's Supabase calls. */
function fakeSupabase(lots: LotRow[]) {
  const inserted: Record<string, unknown>[] = [];
  const updates: { id: unknown; patch: Record<string, unknown> }[] = [];
  const selectChain = {
    eq: () => selectChain,
    gt: () => selectChain,
    is: () => selectChain,
    order: () => Promise.resolve({ data: lots, error: null }),
  };
  const client = {
    from: () => ({
      select: () => selectChain,
      insert: (row: Record<string, unknown>) => {
        inserted.push(row);
        return Promise.resolve({ error: null });
      },
      update: (patch: Record<string, unknown>) => ({
        eq: (_col: string, id: unknown) => {
          updates.push({ id, patch });
          return Promise.resolve({ error: null });
        },
      }),
    }),
  };
  return { client: client as unknown as SupabaseClient, inserted, updates };
}

describe('recordRemoveTransaction', () => {
  const lots: LotRow[] = [
    { id: 'l1', remaining_quantity: 5, unit_price: 10, transaction_date: '2026-01-01T00:00:00Z' },
    { id: 'l2', remaining_quantity: 5, unit_price: 20, transaction_date: '2026-01-02T00:00:00Z' },
  ];

  it('returns the weighted FIFO cost of the removed quantity', async () => {
    const { client, updates } = fakeSupabase(lots);
    const removedValue = await recordRemoveTransaction(client, 'b1', 'u1', 'item1', 8, null);
    // 5 × ₹10 from the oldest lot + 3 × ₹20 from the next = ₹110.
    expect(removedValue).toBe(110);
    expect(updates).toEqual([
      { id: 'l1', patch: { remaining_quantity: 0 } },
      { id: 'l2', patch: { remaining_quantity: 2 } },
    ]);
  });

  it('stores the FIFO cost per unit on the remove row', async () => {
    const { client, inserted } = fakeSupabase(lots);
    await recordRemoveTransaction(client, 'b1', 'u1', 'item1', 8, null);
    expect(inserted[0]).toMatchObject({ transaction_type: 'remove', unit_price: 13.75 });
  });

  it('throws InsufficientStockError when lots cannot cover the quantity', async () => {
    const { client } = fakeSupabase(lots);
    await expect(
      recordRemoveTransaction(client, 'b1', 'u1', 'item1', 11, null),
    ).rejects.toThrow(InsufficientStockError);
  });
});
