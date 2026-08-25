import {
  canRemoveQuantity,
  computeCurrentInventory,
  computeCurrentStock,
  computeFifoValue,
  planFifoRemoval,
  type FifoTransaction,
  type OpenLot,
} from '@/lib/inventory/fifo';

function txn(partial: Partial<FifoTransaction> & Pick<FifoTransaction, 'id'>): FifoTransaction {
  return {
    masterItemId: 'item-1',
    transactionType: 'add',
    quantity: 0,
    unitPrice: 0,
    remainingQuantity: 0,
    transactionDate: '2026-08-01T00:00:00Z',
    ...partial,
  };
}

describe('computeCurrentStock', () => {
  it('is Σ(add) − Σ(remove)', () => {
    const stock = computeCurrentStock([
      txn({ id: 'a', quantity: 10, remainingQuantity: 7 }),
      txn({ id: 'b', transactionType: 'remove', quantity: 3 }),
    ]);
    expect(stock).toBe(7);
  });

  it('is 0 with no transactions', () => {
    expect(computeCurrentStock([])).toBe(0);
  });
});

describe('computeFifoValue', () => {
  it('values only the open remainder of add lots (spec §13 case: 10 @ ₹100, remove 3 → ₹700)', () => {
    const value = computeFifoValue([
      txn({ id: 'a', quantity: 10, unitPrice: 100, remainingQuantity: 7 }),
      txn({ id: 'b', transactionType: 'remove', quantity: 3, unitPrice: 0 }),
    ]);
    expect(value).toBe(700);
  });

  it('sums across multiple lots at different prices', () => {
    const value = computeFifoValue([
      txn({ id: 'a', quantity: 5, unitPrice: 10, remainingQuantity: 2 }),
      txn({ id: 'b', quantity: 4, unitPrice: 25, remainingQuantity: 4 }),
    ]);
    expect(value).toBe(120);
  });
});

describe('planFifoRemoval', () => {
  const lots: OpenLot[] = [
    { id: 'newer', remainingQuantity: 5, unitPrice: 20, transactionDate: '2026-08-02T00:00:00Z' },
    { id: 'older', remainingQuantity: 4, unitPrice: 10, transactionDate: '2026-08-01T00:00:00Z' },
  ];

  it('consumes the oldest lot first', () => {
    const plan = planFifoRemoval(lots, 3);
    expect(plan).not.toBeNull();
    expect(plan!.consumptions).toEqual([
      { lotId: 'older', consumedQuantity: 3, newRemainingQuantity: 1, unitPrice: 10 },
    ]);
    expect(plan!.removedValue).toBe(30);
  });

  it('spans lots when the oldest cannot cover the quantity', () => {
    const plan = planFifoRemoval(lots, 6);
    expect(plan!.consumptions.map((c) => c.lotId)).toEqual(['older', 'newer']);
    expect(plan!.consumptions[1]!).toEqual({
      lotId: 'newer',
      consumedQuantity: 2,
      newRemainingQuantity: 3,
      unitPrice: 20,
    });
    expect(plan!.removedValue).toBe(80);
  });

  it('returns null when stock is insufficient', () => {
    expect(planFifoRemoval(lots, 9.5)).toBeNull();
  });

  it('returns null for zero or negative quantities', () => {
    expect(planFifoRemoval(lots, 0)).toBeNull();
    expect(planFifoRemoval(lots, -2)).toBeNull();
  });
});

describe('canRemoveQuantity', () => {
  it('rejects removing more than current stock', () => {
    expect(canRemoveQuantity(7, 8)).toBe(false);
  });

  it('allows removing up to exactly the current stock', () => {
    expect(canRemoveQuantity(7, 7)).toBe(true);
    expect(canRemoveQuantity(7, 2.5)).toBe(true);
  });

  it('rejects zero, negative and non-finite quantities', () => {
    expect(canRemoveQuantity(7, 0)).toBe(false);
    expect(canRemoveQuantity(7, -1)).toBe(false);
    expect(canRemoveQuantity(7, Number.NaN)).toBe(false);
  });
});

describe('computeCurrentInventory', () => {
  it('mirrors the server helper: per-item stock, value and last transaction', () => {
    const items = [
      { id: 'item-1', name: 'Chair', unit: 'pcs', imagePath: null },
      { id: 'item-2', name: 'Rice', unit: 'kg', imagePath: 'p.webp' },
    ];
    const rows = computeCurrentInventory(items, [
      txn({ id: 'a', quantity: 10, unitPrice: 100, remainingQuantity: 7 }),
      txn({
        id: 'b',
        transactionType: 'remove',
        quantity: 3,
        transactionDate: '2026-08-03T00:00:00Z',
      }),
    ]);
    expect(rows[0]!).toEqual({
      masterItemId: 'item-1',
      name: 'Chair',
      unit: 'pcs',
      imagePath: null,
      currentQuantity: 7,
      currentValue: 700,
      lastTransactionAt: '2026-08-03T00:00:00Z',
    });
    expect(rows[1]!.currentQuantity).toBe(0);
    expect(rows[1]!.lastTransactionAt).toBeNull();
  });
});
