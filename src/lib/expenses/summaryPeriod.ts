/**
 * Expenses home summary period (Android parity): the "You gave / You got"
 * totals card at the top of the Expenses tab is scoped to a period —
 * THIS MONTH (default), THIS YEAR or ALL TIME — chosen with a segmented
 * control inside the card. The choice is a device-local UI preference
 * persisted in localStorage (same contract as the list sort / booking view
 * toggle prefs).
 *
 * Membership is decided on `expense_date` (the user-entered ISO `yyyy-mm-dd`
 * day, NOT `created_at`) by comparing its `yyyy` / `yyyy-mm` prefix with the
 * device's LOCAL calendar month/year. Both sides are built from local date
 * parts — never `toISOString()` — so an entry dated today never slips into
 * "last month" for users east of UTC in the evening (IST at 23:30 is already
 * tomorrow in UTC).
 */

export type SummaryPeriod = 'month' | 'year' | 'all';

export const DEFAULT_SUMMARY_PERIOD: SummaryPeriod = 'month';

/** Display order of the segmented control. */
export const SUMMARY_PERIODS: readonly SummaryPeriod[] = ['month', 'year', 'all'];

export const SUMMARY_PERIOD_STORAGE_KEY = 'samaroh_expenses_summary_period';

export function isSummaryPeriod(value: unknown): value is SummaryPeriod {
  return (SUMMARY_PERIODS as readonly unknown[]).includes(value);
}

export function readSummaryPeriod(): SummaryPeriod {
  try {
    const raw = window.localStorage.getItem(SUMMARY_PERIOD_STORAGE_KEY);
    if (isSummaryPeriod(raw)) {
      return raw;
    }
  } catch {
    // Storage unavailable (privacy mode / SSR) → default.
  }
  return DEFAULT_SUMMARY_PERIOD;
}

export function writeSummaryPeriod(period: SummaryPeriod): void {
  try {
    window.localStorage.setItem(SUMMARY_PERIOD_STORAGE_KEY, period);
  } catch {
    // Best-effort persistence, mirroring the other device-local prefs.
  }
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** `yyyy-mm` of a Date in the device's local time zone. */
export function localYearMonth(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

/** `yyyy` of a Date in the device's local time zone. */
export function localYear(date: Date): string {
  return String(date.getFullYear());
}

/**
 * True when an ISO `yyyy-mm-dd` expense date falls in the chosen period
 * relative to `today` (local calendar). Pure prefix comparison — the expense
 * date is never parsed into a Date, so there is no UTC round-trip to shift it.
 */
export function isInSummaryPeriod(
  expenseDate: string,
  period: SummaryPeriod,
  today: Date = new Date(),
): boolean {
  switch (period) {
    case 'all':
      return true;
    case 'year':
      return expenseDate.slice(0, 4) === localYear(today);
    case 'month':
      return expenseDate.slice(0, 7) === localYearMonth(today);
  }
}

/** Filters rows carrying an `expense_date` to the chosen period. */
export function filterBySummaryPeriod<T extends { expense_date: string }>(
  rows: readonly T[],
  period: SummaryPeriod,
  today: Date = new Date(),
): T[] {
  if (period === 'all') {
    return [...rows];
  }
  return rows.filter((row) => isInSummaryPeriod(row.expense_date, period, today));
}
