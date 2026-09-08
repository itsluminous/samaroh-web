/**
 * FIFO replay engine (transaction edit/delete): replays one item's would-be
 * history chronologically and returns minimal column patches — or null when
 * some remove would exceed the stock available at its point in time
 * (historical negative stock ⇒ the mutation is rejected).
 */
import { replayFifo, type FifoTransaction } from '../fifo';

let seq = 0;

function txn(overrides: Partial<FifoTransaction>): FifoTransaction {
  seq += 1;
  return {
    id: `t${seq}`,
    masterItemId: 'item1',
    transactionType: 'add',
    quantity: 0,
    unitPrice: 0,
    remainingQuantity: 0,
    transactionDate: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  seq = 0;
});

describe('replayFifo', () => {
  it('returns no updates when the stored history is already consistent', () => {
    // add 10 @ ₹5, later remove 4 → remaining 6, remove cost ₹5/unit.
    const history = [
      txn({ id: 'a1', quantity: 10, unitPrice: 5, remainingQuantity: 6, transactionDate: '2026-01-01T00:00:00Z' }),
      txn({ id: 'r1', transactionType: 'remove', quantity: 4, unitPrice: 5, remainingQuantity: 0, transactionDate: '2026-01-02T00:00:00Z' }),
    ];
    expect(replayFifo(history)).toEqual([]);
  });

  it('deleting a remove restores the consumed lot remainders', () => {
    // History WITHOUT the deleted remove: the lot still carries the old
    // (consumed) remaining — replay must restore it to the full quantity.
    const history = [
      txn({ id: 'a1', quantity: 10, unitPrice: 5, remainingQuantity: 6, transactionDate: '2026-01-01T00:00:00Z' }),
    ];
    expect(replayFifo(history)).toEqual([{ id: 'a1', remainingQuantity: 10 }]);
  });

  it('rejects deleting an add lot that later removes already consumed', () => {
    // Stored history had add 10 + remove 8; the would-be history drops the add.
    const history = [
      txn({ id: 'r1', transactionType: 'remove', quantity: 8, unitPrice: 5, remainingQuantity: 0, transactionDate: '2026-01-02T00:00:00Z' }),
    ];
    expect(replayFifo(history)).toBeNull();
  });

  it('rejects an edit that shrinks an add below what history already consumed', () => {
    // add edited from 10 down to 3, but a later remove takes 8.
    const history = [
      txn({ id: 'a1', quantity: 3, unitPrice: 5, remainingQuantity: 2, transactionDate: '2026-01-01T00:00:00Z' }),
      txn({ id: 'r1', transactionType: 'remove', quantity: 8, unitPrice: 5, remainingQuantity: 0, transactionDate: '2026-01-02T00:00:00Z' }),
    ];
    expect(replayFifo(history)).toBeNull();
  });

  it('growing an add lot gives back remainder to LATER lots (FIFO shifts)', () => {
    // Stored: a1 5@10 (rem 0), a2 5@20 (rem 2), r1 removes 8. Edit a1 → 8:
    // r1 now takes all 8 from a1, a2 goes untouched (rem 5), a1 rem 0,
    // and r1's derived cost drops to ₹10/unit.
    const history = [
      txn({ id: 'a1', quantity: 8, unitPrice: 10, remainingQuantity: 0, transactionDate: '2026-01-01T00:00:00Z' }),
      txn({ id: 'a2', quantity: 5, unitPrice: 20, remainingQuantity: 2, transactionDate: '2026-01-02T00:00:00Z' }),
      txn({ id: 'r1', transactionType: 'remove', quantity: 8, unitPrice: 13.75, remainingQuantity: 0, transactionDate: '2026-01-03T00:00:00Z' }),
    ];
    expect(replayFifo(history)).toEqual([
      { id: 'a2', remainingQuantity: 5 },
      { id: 'r1', unitPrice: 10 },
    ]);
  });

  it('rejects a remove edited beyond the stock available at its date', () => {
    // Only 5 in stock when r1 happens (a2 comes later) — editing r1 to 6 fails
    // even though total adds (10) would cover it at the end.
    const history = [
      txn({ id: 'a1', quantity: 5, unitPrice: 10, remainingQuantity: 0, transactionDate: '2026-01-01T00:00:00Z' }),
      txn({ id: 'r1', transactionType: 'remove', quantity: 6, unitPrice: 10, remainingQuantity: 0, transactionDate: '2026-01-02T00:00:00Z' }),
      txn({ id: 'a2', quantity: 5, unitPrice: 10, remainingQuantity: 5, transactionDate: '2026-01-03T00:00:00Z' }),
    ];
    expect(replayFifo(history)).toBeNull();
  });

  it('shrinking a remove gives quantity back to lots and recomputes its cost', () => {
    // Stored: a1 5@10 rem 0, a2 5@20 rem 2, r1 8 @ 13.75. Edit r1 → 3:
    // it consumes only from a1 (rem 2), a2 stays full (rem 5), cost ₹10/unit.
    const history = [
      txn({ id: 'a1', quantity: 5, unitPrice: 10, remainingQuantity: 0, transactionDate: '2026-01-01T00:00:00Z' }),
      txn({ id: 'a2', quantity: 5, unitPrice: 20, remainingQuantity: 2, transactionDate: '2026-01-02T00:00:00Z' }),
      txn({ id: 'r1', transactionType: 'remove', quantity: 3, unitPrice: 13.75, remainingQuantity: 0, transactionDate: '2026-01-03T00:00:00Z' }),
    ];
    expect(replayFifo(history)).toEqual([
      { id: 'a1', remainingQuantity: 2 },
      { id: 'a2', remainingQuantity: 5 },
      { id: 'r1', unitPrice: 10 },
    ]);
  });

  it('editing an add unit price recomputes downstream remove costs', () => {
    // a1 price edited 10 → 12; r1 consumed 4 of it, so its derived
    // cost-per-unit must follow.
    const history = [
      txn({ id: 'a1', quantity: 10, unitPrice: 12, remainingQuantity: 6, transactionDate: '2026-01-01T00:00:00Z' }),
      txn({ id: 'r1', transactionType: 'remove', quantity: 4, unitPrice: 10, remainingQuantity: 0, transactionDate: '2026-01-02T00:00:00Z' }),
    ];
    expect(replayFifo(history)).toEqual([{ id: 'r1', unitPrice: 12 }]);
  });

  it('rejects a history where a remove predates every add', () => {
    const history = [
      txn({ id: 'r1', transactionType: 'remove', quantity: 1, unitPrice: 0, remainingQuantity: 0, transactionDate: '2026-01-01T00:00:00Z' }),
      txn({ id: 'a1', quantity: 10, unitPrice: 5, remainingQuantity: 9, transactionDate: '2026-01-02T00:00:00Z' }),
    ];
    expect(replayFifo(history)).toBeNull();
  });

  it('replays chronologically regardless of input array order', () => {
    // Same as the delete-a-remove case but with rows shuffled newest-first
    // (the fetch order) — replay must sort by date before consuming.
    const history = [
      txn({ id: 'r1', transactionType: 'remove', quantity: 4, unitPrice: 20, remainingQuantity: 0, transactionDate: '2026-01-03T00:00:00Z' }),
      txn({ id: 'a2', quantity: 5, unitPrice: 20, remainingQuantity: 5, transactionDate: '2026-01-02T00:00:00Z' }),
      txn({ id: 'a1', quantity: 5, unitPrice: 10, remainingQuantity: 5, transactionDate: '2026-01-01T00:00:00Z' }),
    ];
    // r1 must consume from a1 (oldest) first even though a2 precedes it in
    // the array: a1 → rem 1, a2 untouched, r1 cost ₹10/unit.
    expect(replayFifo(history)).toEqual([
      { id: 'a1', remainingQuantity: 1 },
      { id: 'r1', unitPrice: 10 },
    ]);
  });

  it('pins a drifted remove remaining_quantity back to 0', () => {
    const history = [
      txn({ id: 'a1', quantity: 10, unitPrice: 5, remainingQuantity: 6, transactionDate: '2026-01-01T00:00:00Z' }),
      txn({ id: 'r1', transactionType: 'remove', quantity: 4, unitPrice: 5, remainingQuantity: 4, transactionDate: '2026-01-02T00:00:00Z' }),
    ];
    expect(replayFifo(history)).toEqual([{ id: 'r1', remainingQuantity: 0 }]);
  });

  it('ties on transaction_date break deterministically by id', () => {
    // Same timestamp: the lexically-smaller id is treated as earlier, so the
    // remove (id r9) can consume the add (id a1) recorded at the same instant.
    const sameTime = '2026-01-01T00:00:00Z';
    const history = [
      txn({ id: 'r9', transactionType: 'remove', quantity: 4, unitPrice: 5, remainingQuantity: 0, transactionDate: sameTime }),
      txn({ id: 'a1', quantity: 10, unitPrice: 5, remainingQuantity: 6, transactionDate: sameTime }),
    ];
    expect(replayFifo(history)).toEqual([]);
  });
});
