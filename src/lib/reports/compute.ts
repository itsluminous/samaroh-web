/**
 * Pure computations behind the 9 reports (§4.4). Everything here is
 * deterministic on its inputs (unit-tested) — data fetching and rendering
 * live elsewhere. Cancelled bookings are excluded from every report.
 *
 * Conventions:
 * - "month" keys are `yyyy-mm`; charts label them locale-aware in the UI.
 * - collected is capped at the booking total; the surplus stays visible in
 *   the booking's own payment history, not in reports.
 */
import type { DateRange, ReportBooking, ReportExpense, ReportParty, ReportPayment } from './types';

const MS_PER_DAY = 86_400_000;

// --- date helpers -----------------------------------------------------------

/** `yyyy-mm` of an ISO date. */
export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** All `yyyy-mm` months touched by the range, in order. */
export function monthsInRange(range: DateRange): string[] {
  const months: string[] = [];
  let y = Number(range.start.slice(0, 4));
  let m = Number(range.start.slice(5, 7));
  const end = range.end.slice(0, 7);
  for (let i = 0; i < 240; i++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    months.push(key);
    if (key === end) {
      break;
    }
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

export function daysInMonth(monthKey: string): number {
  const y = Number(monthKey.slice(0, 4));
  const m = Number(monthKey.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function diffDays(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / MS_PER_DAY);
}

function active(bookings: ReportBooking[]): ReportBooking[] {
  return bookings.filter((b) => b.status !== 'cancelled');
}

function paidByBooking(payments: ReportPayment[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of payments) {
    map.set(p.booking_id, (map.get(p.booking_id) ?? 0) + p.amount);
  }
  return map;
}

// --- 1. Revenue summary -----------------------------------------------------

export interface RevenueMonthRow {
  month: string;
  collected: number;
  outstanding: number;
  total: number;
}

/** Bookings revenue by month of start_date; collected vs outstanding. */
export function revenueByMonth(
  bookings: ReportBooking[],
  payments: ReportPayment[],
  range: DateRange,
): RevenueMonthRow[] {
  const paid = paidByBooking(payments);
  const rows = new Map<string, RevenueMonthRow>(
    monthsInRange(range).map((m) => [m, { month: m, collected: 0, outstanding: 0, total: 0 }]),
  );
  for (const b of active(bookings)) {
    const row = rows.get(monthOf(b.start_date));
    if (!row) {
      continue;
    }
    const collected = Math.min(paid.get(b.id) ?? 0, b.total_amount);
    row.collected += collected;
    row.outstanding += b.total_amount - collected;
    row.total += b.total_amount;
  }
  return [...rows.values()];
}

// --- 2. Outstanding dues (aging) --------------------------------------------

export type AgingBucket = '0_7' | '8_30' | '31_90' | '90_plus';

export interface DueRow {
  bookingId: string;
  customer: string;
  eventType: string;
  eventIcon: string;
  endDate: string;
  due: number;
  daysOverdue: number;
  bucket: AgingBucket;
}

export function agingBucketOf(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 7) {
    return '0_7';
  }
  if (daysOverdue <= 30) {
    return '8_30';
  }
  if (daysOverdue <= 90) {
    return '31_90';
  }
  return '90_plus';
}

/** Who owes what: bookings past their end date with money still due. */
export function outstandingDues(
  bookings: ReportBooking[],
  payments: ReportPayment[],
  todayIso: string,
): DueRow[] {
  const paid = paidByBooking(payments);
  const rows: DueRow[] = [];
  for (const b of active(bookings)) {
    if (b.end_date > todayIso) {
      continue;
    }
    const due = b.total_amount - Math.min(paid.get(b.id) ?? 0, b.total_amount);
    if (due <= 0) {
      continue;
    }
    const daysOverdue = Math.max(diffDays(b.end_date, todayIso), 0);
    rows.push({
      bookingId: b.id,
      customer: b.customer_name,
      eventType: b.event_type,
      eventIcon: b.event_icon,
      endDate: b.end_date,
      due,
      daysOverdue,
      bucket: agingBucketOf(daysOverdue),
    });
  }
  return rows.sort((a, b) => b.daysOverdue - a.daysOverdue);
}

export function duesByBucket(rows: DueRow[]): Record<AgingBucket, number> {
  const totals: Record<AgingBucket, number> = { '0_7': 0, '8_30': 0, '31_90': 0, '90_plus': 0 };
  for (const row of rows) {
    totals[row.bucket] += row.due;
  }
  return totals;
}

// --- 3. Occupancy -----------------------------------------------------------

export interface OccupancyRow {
  month: string;
  bookedDays: number;
  daysInMonth: number;
  /** 0..1 — booked days over calendar days. */
  utilization: number;
}

/** Booked days per month (a day counts once however many bookings touch it). */
export function occupancyByMonth(bookings: ReportBooking[], range: DateRange): OccupancyRow[] {
  const bookedByMonth = new Map<string, Set<string>>();
  for (const b of active(bookings)) {
    const from = b.start_date > range.start ? b.start_date : range.start;
    const to = b.end_date < range.end ? b.end_date : range.end;
    const cursor = new Date(`${from}T00:00:00Z`);
    const stop = Date.parse(`${to}T00:00:00Z`);
    while (cursor.getTime() <= stop) {
      const iso = cursor.toISOString().slice(0, 10);
      const set = bookedByMonth.get(monthOf(iso)) ?? new Set<string>();
      set.add(iso);
      bookedByMonth.set(monthOf(iso), set);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  return monthsInRange(range).map((month) => {
    const bookedDays = bookedByMonth.get(month)?.size ?? 0;
    const total = daysInMonth(month);
    return { month, bookedDays, daysInMonth: total, utilization: bookedDays / total };
  });
}

// --- 4/5. Event type & source breakdowns -------------------------------------

export interface BreakdownRow {
  key: string;
  count: number;
  revenue: number;
}

export function eventTypeBreakdown(bookings: ReportBooking[]): BreakdownRow[] {
  return groupBreakdown(active(bookings), (b) => b.event_type);
}

/** Bookings without a recorded source group under 'other'. */
export function sourceBreakdown(bookings: ReportBooking[]): BreakdownRow[] {
  return groupBreakdown(active(bookings), (b) => b.source ?? 'other');
}

function groupBreakdown(bookings: ReportBooking[], keyOf: (b: ReportBooking) => string): BreakdownRow[] {
  const map = new Map<string, BreakdownRow>();
  for (const b of bookings) {
    const key = keyOf(b);
    const row = map.get(key) ?? { key, count: 0, revenue: 0 };
    row.count += 1;
    row.revenue += b.total_amount;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

// --- 6. Expense summary -------------------------------------------------------

export interface ExpenseMonthRow {
  month: string;
  spend: number;
}

export interface PartySpendRow {
  partyId: string;
  name: string;
  spend: number;
}

/** Monthly spend = 'paid' (money out) ledger entries. */
export function expenseSpendByMonth(expenses: ReportExpense[], range: DateRange): ExpenseMonthRow[] {
  const rows = new Map<string, ExpenseMonthRow>(monthsInRange(range).map((m) => [m, { month: m, spend: 0 }]));
  for (const e of expenses) {
    if (e.direction !== 'paid') {
      continue;
    }
    const row = rows.get(monthOf(e.expense_date));
    if (row) {
      row.spend += e.amount;
    }
  }
  return [...rows.values()];
}

export function topPartiesBySpend(
  expenses: ReportExpense[],
  parties: ReportParty[],
  limit = 10,
): PartySpendRow[] {
  const names = new Map(parties.map((p) => [p.id, p.name]));
  const spend = new Map<string, number>();
  for (const e of expenses) {
    if (e.direction !== 'paid') {
      continue;
    }
    spend.set(e.party_id, (spend.get(e.party_id) ?? 0) + e.amount);
  }
  return [...spend.entries()]
    .map(([partyId, total]) => ({ partyId, name: names.get(partyId) ?? partyId, spend: total }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, limit);
}

// --- 7. Profit view -----------------------------------------------------------

export interface ProfitMonthRow {
  month: string;
  income: number;
  spend: number;
  net: number;
}

/**
 * Cash-basis profit: payments received in the month minus 'paid' ledger
 * entries in the month ('received' entries count back into income).
 */
export function profitByMonth(
  payments: ReportPayment[],
  expenses: ReportExpense[],
  range: DateRange,
): ProfitMonthRow[] {
  const rows = new Map<string, ProfitMonthRow>(
    monthsInRange(range).map((m) => [m, { month: m, income: 0, spend: 0, net: 0 }]),
  );
  for (const p of payments) {
    const row = rows.get(monthOf(p.paid_on));
    if (row) {
      row.income += p.amount;
    }
  }
  for (const e of expenses) {
    const row = rows.get(monthOf(e.expense_date));
    if (!row) {
      continue;
    }
    if (e.direction === 'paid') {
      row.spend += e.amount;
    } else {
      row.income += e.amount;
    }
  }
  for (const row of rows.values()) {
    row.net = row.income - row.spend;
  }
  return [...rows.values()];
}

// --- 9. Collection efficiency ---------------------------------------------------

export interface CollectionRow {
  bookingId: string;
  customer: string;
  endDate: string;
  paidOn: string;
  /** Days from event end to the payment that settled the balance (0 = on/before end). */
  daysToPay: number;
}

export interface CollectionSummary {
  rows: CollectionRow[];
  averageDays: number | null;
}

/** Average days from event end to full payment, over fully-paid past bookings. */
export function collectionEfficiency(
  bookings: ReportBooking[],
  payments: ReportPayment[],
  todayIso: string,
): CollectionSummary {
  const byBooking = new Map<string, ReportPayment[]>();
  for (const p of payments) {
    const list = byBooking.get(p.booking_id);
    if (list) {
      list.push(p);
    } else {
      byBooking.set(p.booking_id, [p]);
    }
  }
  const rows: CollectionRow[] = [];
  for (const b of active(bookings)) {
    if (b.end_date > todayIso || b.total_amount <= 0) {
      continue;
    }
    const list = (byBooking.get(b.id) ?? []).slice().sort((a, c) => a.paid_on.localeCompare(c.paid_on));
    let running = 0;
    let settledOn: string | null = null;
    for (const p of list) {
      running += p.amount;
      if (running >= b.total_amount) {
        settledOn = p.paid_on;
        break;
      }
    }
    if (!settledOn) {
      continue;
    }
    rows.push({
      bookingId: b.id,
      customer: b.customer_name,
      endDate: b.end_date,
      paidOn: settledOn,
      daysToPay: Math.max(diffDays(b.end_date, settledOn), 0),
    });
  }
  rows.sort((a, b) => b.endDate.localeCompare(a.endDate));
  const averageDays =
    rows.length === 0 ? null : rows.reduce((sum, r) => sum + r.daysToPay, 0) / rows.length;
  return { rows, averageDays };
}
