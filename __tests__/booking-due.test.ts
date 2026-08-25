// due = total − Σ(non-deleted payments) — always computed, never stored.

import { computeDue, computePaid } from '@/lib/booking/due';
import { makePayment } from '../test-utils/fixtures';

describe('computePaid / computeDue', () => {
  it('sums payments and subtracts from the total', () => {
    const payments = [makePayment({ amount: 25000 }), makePayment({ amount: 15000 })];
    expect(computePaid(payments)).toBe(40000);
    expect(computeDue(100000, payments)).toBe(60000);
  });

  it('ignores soft-deleted payments', () => {
    const payments = [
      makePayment({ amount: 25000 }),
      makePayment({ amount: 99999, deleted_at: '2026-07-02T00:00:00Z' }),
    ];
    expect(computePaid(payments)).toBe(25000);
    expect(computeDue(100000, payments)).toBe(75000);
  });

  it('is exact with paise (no float drift)', () => {
    const payments = [makePayment({ amount: 0.1 }), makePayment({ amount: 0.2 })];
    expect(computePaid(payments)).toBe(0.3);
    expect(computeDue(1, payments)).toBe(0.7);
  });

  it('goes negative on overpayment (renderers clamp for display)', () => {
    expect(computeDue(500, [makePayment({ amount: 600 })])).toBe(-100);
  });

  it('handles no payments', () => {
    expect(computePaid([])).toBe(0);
    expect(computeDue(100000, [])).toBe(100000);
  });
});
