/**
 * Party business/personal flag feature: personal parties are excluded from
 * the financial aggregations (expense summary, profit), get their own
 * personal-expenses report, and CSV exports carry TOTAL rows with plain
 * machine-readable numbers. Also round-trips the flag through the guest
 * local store (including pre-flag rows normalizing to business).
 */
import 'fake-indexeddb/auto';
import {
  expenseSummaryByMonth,
  partitionExpensesByParty,
  personalSpendByMonth,
  personalSpendByParty,
  profitByMonth,
  profitTotals,
  sumBy,
} from '@/lib/reports/compute';
import { csvAmount, toCsv, toCsvSections } from '@/lib/reports/csv';
import { fetchPartyNames } from '@/lib/reports/queries';
import type { ReportExpense, ReportParty, ReportPayment } from '@/lib/reports/types';
import { createLocalClient } from '@/lib/guest/localClient';
import { guestDb } from '@/lib/guest/localDb';
import {
  createParty,
  fetchParties,
  fetchParty,
  normalizeBusinessRelated,
  updatePartyBusinessRelated,
} from '@/app/[locale]/(app)/expenses/_lib/queries';

const RANGE = { start: '2026-01-01', end: '2026-02-28' };

const PARTIES: ReportParty[] = [
  { id: 'biz1', name: 'Tent House', business_related: true },
  { id: 'per1', name: 'Family Doctor', business_related: false },
  { id: 'per2', name: 'School Fees', business_related: false },
];

const EXPENSES: ReportExpense[] = [
  { party_id: 'biz1', direction: 'paid', amount: 500, expense_date: '2026-01-10' },
  { party_id: 'biz1', direction: 'received', amount: 100, expense_date: '2026-02-05' },
  { party_id: 'per1', direction: 'paid', amount: 200, expense_date: '2026-01-15' },
  { party_id: 'per2', direction: 'paid', amount: 300, expense_date: '2026-02-20' },
  { party_id: 'per1', direction: 'received', amount: 50, expense_date: '2026-02-25' },
  // Unknown party (not in the list) counts as business — true is the default.
  { party_id: 'ghost', direction: 'paid', amount: 40, expense_date: '2026-01-20' },
];

describe('partitionExpensesByParty', () => {
  it('splits on the owning party flag, unknown parties default to business', () => {
    const { business, personal } = partitionExpensesByParty(EXPENSES, PARTIES);
    expect(business.map((e) => e.party_id)).toEqual(['biz1', 'biz1', 'ghost']);
    expect(personal.map((e) => e.party_id)).toEqual(['per1', 'per2', 'per1']);
  });
});

describe('personal exclusion in financial aggregations', () => {
  it('excludes personal spend from the expense summary months', () => {
    const { business } = partitionExpensesByParty(EXPENSES, PARTIES);
    const rows = expenseSummaryByMonth(business, [], RANGE);
    expect(rows).toEqual([
      { month: '2026-01', ledger: 540, inventory: 0, total: 540 },
      { month: '2026-02', ledger: 0, inventory: 0, total: 0 },
    ]);
  });

  it('excludes personal entries from profit in both directions', () => {
    const payments: ReportPayment[] = [{ booking_id: 'b1', amount: 1000, paid_on: '2026-01-05' }];
    const { business } = partitionExpensesByParty(EXPENSES, PARTIES);
    const rows = profitByMonth(payments, business, [], RANGE);
    // Personal 'paid' (200 + 300) does not lower profit; personal 'received' (50) does not raise it.
    expect(rows).toEqual([
      { month: '2026-01', income: 1000, spend: 540, net: 460 },
      { month: '2026-02', income: 100, spend: 0, net: 100 },
    ]);
  });
});

describe('personal expenses report', () => {
  it('aggregates personal paid spend by month', () => {
    expect(personalSpendByMonth(EXPENSES, PARTIES, RANGE)).toEqual([
      { month: '2026-01', spend: 200 },
      { month: '2026-02', spend: 300 },
    ]);
  });

  it('aggregates personal paid spend by party, largest first, without a limit', () => {
    const rows = personalSpendByParty(EXPENSES, PARTIES);
    expect(rows).toEqual([
      { partyId: 'per2', name: 'School Fees', spend: 300 },
      { partyId: 'per1', name: 'Family Doctor', spend: 200 },
    ]);
  });

  it('is empty when every party is business-related', () => {
    const allBusiness = PARTIES.map((p) => ({ ...p, business_related: true }));
    expect(personalSpendByParty(EXPENSES, allBusiness)).toEqual([]);
    expect(personalSpendByMonth(EXPENSES, allBusiness, RANGE).every((r) => r.spend === 0)).toBe(true);
  });
});

describe('totals math', () => {
  it('sums a numeric projection', () => {
    expect(sumBy([{ v: 1.5 }, { v: 2 }, { v: -0.5 }], (r) => r.v)).toBe(3);
    expect(sumBy([], () => 1)).toBe(0);
  });

  it('computes profit totals: total income, total expense, total net', () => {
    const totals = profitTotals([
      { month: '2026-01', income: 1000, spend: 540, net: 460 },
      { month: '2026-02', income: 100, spend: 0, net: 100 },
    ]);
    expect(totals).toEqual({ income: 1100, spend: 540, net: 560 });
  });
});

describe('CSV format', () => {
  it('formats money as plain decimal rupees — no symbol, no grouping', () => {
    expect(csvAmount(1065116.1)).toBe('1065116.10');
    expect(csvAmount(0)).toBe('0.00');
    expect(csvAmount(-1234.567)).toBe('-1234.57');
    expect(csvAmount(Number.NaN)).toBe('0.00');
    expect(csvAmount(-0.0001)).toBe('0.00');
  });

  it('never needs quoting for plain amounts (no commas)', () => {
    const csv = toCsv(['Month', 'Total'], [['2026-01', csvAmount(10651161)]]);
    expect(csv).toContain('2026-01,10651161.00');
    expect(csv).not.toContain('"');
  });

  it('joins CSV sections with a blank line and optional title lines', () => {
    const csv = toCsvSections([
      { headers: ['Month', 'Spend'], rows: [['2026-01', '200.00'], ['Total', '200.00']] },
      { title: 'By party', headers: ['Party', 'Spend'], rows: [['Family Doctor', '200.00']] },
    ]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toBe(
      '\uFEFFMonth,Spend\r\n2026-01,200.00\r\nTotal,200.00\r\n\r\nBy party\r\nParty,Spend\r\nFamily Doctor,200.00\r\n',
    );
  });

  it('quotes section cells that contain commas or quotes', () => {
    const csv = toCsvSections([{ headers: ['a'], rows: [['x,y'], ['say "hi"']] }]);
    expect(csv).toContain('"x,y"');
    expect(csv).toContain('"say ""hi"""');
  });
});

describe('party flag round-trip (guest local store)', () => {
  const client = createLocalClient();

  beforeEach(async () => {
    await Promise.all(guestDb.tables.map((t) => t.clear()));
  });

  it('normalizes only an explicit false to personal', () => {
    expect(normalizeBusinessRelated(true)).toBe(true);
    expect(normalizeBusinessRelated(false)).toBe(false);
    expect(normalizeBusinessRelated(null)).toBe(true);
    expect(normalizeBusinessRelated(undefined)).toBe(true);
  });

  it('round-trips a personal party through create → fetch → update', async () => {
    const created = await createParty(client, 'b1', 'Family Doctor', null, false);
    expect(created.business_related).toBe(false);

    const fetched = await fetchParty(client, created.id);
    expect(fetched?.business_related).toBe(false);

    await updatePartyBusinessRelated(client, created, true);
    const flipped = await fetchParty(client, created.id);
    expect(flipped?.business_related).toBe(true);
  });

  it('defaults business parties to true and lists the flag on fetchParties', async () => {
    await createParty(client, 'b1', 'Tent House', '99', true);
    await createParty(client, 'b1', 'School Fees', null, false);
    const rows = await fetchParties(client, 'b1');
    expect(rows.map((r) => [r.name, r.business_related])).toEqual([
      ['School Fees', false],
      ['Tent House', true],
    ]);
  });

  it('treats pre-flag rows (no business_related field) as business', async () => {
    // A guest row created before the flag shipped — the field is absent.
    await client.from('parties').insert({ id: 'legacy', business_id: 'b1', name: 'Old Party', phone: null });
    const rows = await fetchParties(client, 'b1');
    expect(rows[0]?.business_related).toBe(true);

    const reportRows = await fetchPartyNames(client, 'b1');
    expect(reportRows).toEqual([{ id: 'legacy', name: 'Old Party', business_related: true }]);
  });
});
