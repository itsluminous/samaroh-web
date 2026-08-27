import {
  agingBucketOf,
  collectionEfficiency,
  daysInMonth,
  duesByBucket,
  eventTypeBreakdown,
  expenseSpendByMonth,
  expenseSummaryByMonth,
  inventoryPurchasesByMonth,
  monthsInRange,
  occupancyByMonth,
  outstandingDues,
  profitByMonth,
  revenueByMonth,
  sourceBreakdown,
  topPartiesBySpend,
} from '@/lib/reports/compute';
import type {
  ReportBooking,
  ReportExpense,
  ReportInventoryPurchase,
  ReportPayment,
} from '@/lib/reports/types';

const RANGE = { start: '2026-01-01', end: '2026-03-31' };

function booking(overrides: Partial<ReportBooking>): ReportBooking {
  return {
    id: 'b1',
    customer_name: 'Asha',
    event_type: 'wedding',
    event_icon: '💒',
    start_date: '2026-01-10',
    end_date: '2026-01-11',
    total_amount: 100000,
    status: 'confirmed',
    source: 'phone',
    ...overrides,
  };
}

describe('month helpers', () => {
  it('lists months in range inclusive', () => {
    expect(monthsInRange(RANGE)).toEqual(['2026-01', '2026-02', '2026-03']);
  });
  it('knows month lengths (leap year)', () => {
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2024-02')).toBe(29);
    expect(daysInMonth('2026-01')).toBe(31);
  });
});

describe('revenueByMonth', () => {
  it('splits collected vs outstanding by booking start month', () => {
    const bookings = [
      booking({ id: 'b1', start_date: '2026-01-10', total_amount: 100000 }),
      booking({ id: 'b2', start_date: '2026-02-05', total_amount: 50000 }),
      booking({ id: 'b3', start_date: '2026-02-20', status: 'cancelled', total_amount: 99999 }),
    ];
    const payments: ReportPayment[] = [
      { booking_id: 'b1', amount: 60000, paid_on: '2026-01-10' },
      { booking_id: 'b1', amount: 50000, paid_on: '2026-01-20' }, // overpay → capped
      { booking_id: 'b2', amount: 10000, paid_on: '2026-02-06' },
    ];
    const rows = revenueByMonth(bookings, payments, RANGE);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ month: '2026-01', collected: 100000, outstanding: 0, total: 100000 });
    expect(rows[1]).toEqual({ month: '2026-02', collected: 10000, outstanding: 40000, total: 50000 });
    expect(rows[2]!.total).toBe(0); // cancelled excluded, empty month present
  });
});

describe('outstanding dues (aging)', () => {
  it('buckets by days overdue and sorts oldest first', () => {
    const bookings = [
      booking({ id: 'b1', end_date: '2026-03-01', total_amount: 10000 }),
      booking({ id: 'b2', end_date: '2025-11-01', total_amount: 20000, customer_name: 'Vikram' }),
      booking({ id: 'b3', end_date: '2026-04-01', total_amount: 30000 }), // future → excluded
      booking({ id: 'b4', end_date: '2026-02-01', total_amount: 5000 }),
    ];
    const payments: ReportPayment[] = [
      { booking_id: 'b4', amount: 5000, paid_on: '2026-02-01' }, // fully paid → excluded
    ];
    const rows = outstandingDues(bookings, payments, '2026-03-05');
    expect(rows.map((r) => r.bookingId)).toEqual(['b2', 'b1']);
    expect(rows[1]).toMatchObject({ due: 10000, daysOverdue: 4, bucket: '0_7' });
    expect(rows[0]!.bucket).toBe('90_plus');
    expect(duesByBucket(rows)['90_plus']).toBe(20000);
  });

  it('maps bucket edges per spec (0–7 / 8–30 / 31–90 / 90+)', () => {
    expect(agingBucketOf(0)).toBe('0_7');
    expect(agingBucketOf(7)).toBe('0_7');
    expect(agingBucketOf(8)).toBe('8_30');
    expect(agingBucketOf(30)).toBe('8_30');
    expect(agingBucketOf(31)).toBe('31_90');
    expect(agingBucketOf(90)).toBe('31_90');
    expect(agingBucketOf(91)).toBe('90_plus');
  });
});

describe('occupancyByMonth', () => {
  it('counts each booked day once and clips to the range', () => {
    const bookings = [
      booking({ id: 'b1', start_date: '2026-01-30', end_date: '2026-02-02' }), // spans months
      booking({ id: 'b2', start_date: '2026-02-02', end_date: '2026-02-03' }), // overlaps b1 on 02-02
      booking({ id: 'b3', start_date: '2025-12-30', end_date: '2026-01-01' }), // clipped at range start
    ];
    const rows = occupancyByMonth(bookings, RANGE);
    expect(rows[0]).toMatchObject({ month: '2026-01', bookedDays: 3 }); // 01, 30, 31
    expect(rows[1]).toMatchObject({ month: '2026-02', bookedDays: 3 }); // 01, 02, 03 (02 deduped)
    expect(rows[1]!.utilization).toBeCloseTo(3 / 28);
  });
});

describe('breakdowns', () => {
  const bookings = [
    booking({ id: 'b1', event_type: 'wedding', total_amount: 100, source: 'phone' }),
    booking({ id: 'b2', event_type: 'wedding', total_amount: 50, source: null }),
    booking({ id: 'b3', event_type: 'birthday', total_amount: 200, source: 'walk_in' }),
  ];
  it('groups event types by revenue, descending', () => {
    expect(eventTypeBreakdown(bookings)).toEqual([
      { key: 'birthday', count: 1, revenue: 200 },
      { key: 'wedding', count: 2, revenue: 150 },
    ]);
  });
  it("groups missing sources under 'other'", () => {
    const rows = sourceBreakdown(bookings);
    expect(rows.find((r) => r.key === 'other')).toEqual({ key: 'other', count: 1, revenue: 50 });
  });
});

describe('expenses + profit', () => {
  const expenses: ReportExpense[] = [
    { party_id: 'p1', direction: 'paid', amount: 500, expense_date: '2026-01-05' },
    { party_id: 'p1', direction: 'paid', amount: 300, expense_date: '2026-02-10' },
    { party_id: 'p2', direction: 'paid', amount: 200, expense_date: '2026-02-15' },
    { party_id: 'p2', direction: 'received', amount: 150, expense_date: '2026-02-20' },
  ];
  const purchases: ReportInventoryPurchase[] = [
    // Two adds in Jan (100×2 + 50×4 = 400), one in Mar (10×30 = 300).
    { quantity: 100, unit_price: 2, transaction_date: '2026-01-08T10:30:00+00:00' },
    { quantity: 50, unit_price: 4, transaction_date: '2026-01-25T23:59:00+00:00' },
    { quantity: 10, unit_price: 30, transaction_date: '2026-03-02T05:00:00+00:00' },
    { quantity: 99, unit_price: 99, transaction_date: '2025-12-31T12:00:00+00:00' }, // out of range
  ];
  it('sums monthly spend from paid entries only', () => {
    const rows = expenseSpendByMonth(expenses, RANGE);
    expect(rows.map((r) => r.spend)).toEqual([500, 500, 0]);
  });
  it('buckets inventory purchases by transaction month at quantity × unit price', () => {
    const rows = inventoryPurchasesByMonth(purchases, RANGE);
    expect(rows.map((r) => r.month)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(rows.map((r) => r.spend)).toEqual([400, 0, 300]); // empty Feb present, out-of-range dropped
  });
  it('skips purchases without a transaction timestamp', () => {
    const rows = inventoryPurchasesByMonth(
      [{ quantity: 5, unit_price: 10, transaction_date: '' }],
      RANGE,
    );
    expect(rows.every((r) => r.spend === 0)).toBe(true);
  });
  it('combines ledger spend and inventory purchases per month', () => {
    const rows = expenseSummaryByMonth(expenses, purchases, RANGE);
    expect(rows).toEqual([
      { month: '2026-01', ledger: 500, inventory: 400, total: 900 },
      { month: '2026-02', ledger: 500, inventory: 0, total: 500 },
      { month: '2026-03', ledger: 0, inventory: 300, total: 300 },
    ]);
  });
  it('keeps zero months when there is no spend at all', () => {
    const rows = expenseSummaryByMonth([], [], RANGE);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.ledger === 0 && r.inventory === 0 && r.total === 0)).toBe(true);
  });
  it('ranks top parties by spend', () => {
    const top = topPartiesBySpend(expenses, [
      { id: 'p1', name: 'Tent House' },
      { id: 'p2', name: 'Caterer' },
    ]);
    expect(top.map((r) => r.name)).toEqual(['Tent House', 'Caterer']);
    expect(top[0]!.spend).toBe(800);
  });
  it('computes cash-basis profit with received entries as income', () => {
    const payments: ReportPayment[] = [{ booking_id: 'b1', amount: 1000, paid_on: '2026-02-01' }];
    const rows = profitByMonth(payments, expenses, [], RANGE);
    expect(rows[1]).toEqual({ month: '2026-02', income: 1150, spend: 500, net: 650 });
    expect(rows[0]).toEqual({ month: '2026-01', income: 0, spend: 500, net: -500 });
  });
  it('subtracts inventory purchases from monthly profit', () => {
    const payments: ReportPayment[] = [{ booking_id: 'b1', amount: 1000, paid_on: '2026-01-15' }];
    const rows = profitByMonth(payments, expenses, purchases, RANGE);
    expect(rows[0]).toEqual({ month: '2026-01', income: 1000, spend: 900, net: 100 });
    expect(rows[1]).toEqual({ month: '2026-02', income: 150, spend: 500, net: -350 });
    expect(rows[2]).toEqual({ month: '2026-03', income: 0, spend: 300, net: -300 });
  });
});

describe('collectionEfficiency', () => {
  it('measures days from event end to the settling payment', () => {
    const bookings = [
      booking({ id: 'b1', end_date: '2026-01-10', total_amount: 1000 }),
      booking({ id: 'b2', end_date: '2026-01-20', total_amount: 1000 }), // never settled
    ];
    const payments: ReportPayment[] = [
      { booking_id: 'b1', amount: 400, paid_on: '2026-01-01' },
      { booking_id: 'b1', amount: 600, paid_on: '2026-01-25' },
      { booking_id: 'b2', amount: 500, paid_on: '2026-01-21' },
    ];
    const summary = collectionEfficiency(bookings, payments, '2026-03-01');
    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0]).toMatchObject({ bookingId: 'b1', daysToPay: 15, paidOn: '2026-01-25' });
    expect(summary.averageDays).toBe(15);
  });

  it('clamps early settlements to 0 days', () => {
    const bookings = [booking({ id: 'b1', end_date: '2026-01-10', total_amount: 500 })];
    const payments: ReportPayment[] = [{ booking_id: 'b1', amount: 500, paid_on: '2026-01-05' }];
    const summary = collectionEfficiency(bookings, payments, '2026-02-01');
    expect(summary.rows[0]!.daysToPay).toBe(0);
  });
});
