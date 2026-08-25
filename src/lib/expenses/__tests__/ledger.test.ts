import {
  computeLedger,
  computeNetBalance,
  computeTotals,
  type LedgerEntryInput,
} from '@/lib/expenses/ledger';

function entry(
  id: string,
  direction: 'paid' | 'received',
  amount: number,
  expenseDate: string,
  createdAt = `${expenseDate}T10:00:00Z`,
): LedgerEntryInput {
  return { id, direction, amount, expenseDate, createdAt };
}

describe('computeLedger', () => {
  it('returns rows newest first with chronological running balances', () => {
    const rows = computeLedger([
      entry('a', 'paid', 500, '2026-08-01'),
      entry('b', 'received', 200, '2026-08-05'),
      entry('c', 'paid', 100, '2026-08-10'),
    ]);
    expect(rows.map((r) => r.entry.id)).toEqual(['c', 'b', 'a']);
    // chronological: +500 → 500, -200 → 300, +100 → 400
    expect(rows.map((r) => r.balanceAfter)).toEqual([400, 300, 500]);
  });

  it('breaks same-day ties by creation time', () => {
    const rows = computeLedger([
      entry('late', 'received', 100, '2026-08-01', '2026-08-01T12:00:00Z'),
      entry('early', 'paid', 300, '2026-08-01', '2026-08-01T09:00:00Z'),
    ]);
    expect(rows.map((r) => r.entry.id)).toEqual(['late', 'early']);
    expect(rows[0]!.balanceAfter).toBe(200);
    expect(rows[1]!.balanceAfter).toBe(300);
  });

  it('handles decimal rupees without float drift', () => {
    const rows = computeLedger([
      entry('a', 'paid', 0.1, '2026-08-01'),
      entry('b', 'paid', 0.2, '2026-08-02'),
    ]);
    expect(rows[0]!.balanceAfter).toBe(0.3);
  });

  it('returns an empty list for no entries', () => {
    expect(computeLedger([])).toEqual([]);
  });
});

describe('computeNetBalance', () => {
  it('is Σ(gave) − Σ(got), negative when you got more', () => {
    expect(
      computeNetBalance([
        entry('a', 'paid', 500, '2026-08-01'),
        entry('b', 'received', 800, '2026-08-02'),
      ]),
    ).toBe(-300);
  });
});

describe('computeTotals', () => {
  it('sums gave and got independently', () => {
    const totals = computeTotals([
      entry('a', 'paid', 500, '2026-08-01'),
      entry('b', 'paid', 250.5, '2026-08-02'),
      entry('c', 'received', 100, '2026-08-03'),
    ]);
    expect(totals).toEqual({ gave: 750.5, got: 100 });
  });
});
