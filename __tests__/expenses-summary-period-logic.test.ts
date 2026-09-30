/**
 * Expenses summary period — pure logic. Membership is by `expense_date`
 * against the LOCAL calendar month/year of "today": month/year boundaries
 * are inclusive on both ends, neighbours are out, ALL keeps everything.
 * Local-date safety: `today` values near midnight (where the UTC date is
 * already/still a different day, month or year) still classify by the local
 * calendar. Persistence round-trips through localStorage with a safe default.
 */
import {
  DEFAULT_SUMMARY_PERIOD,
  SUMMARY_PERIOD_STORAGE_KEY,
  SUMMARY_PERIODS,
  filterBySummaryPeriod,
  isInSummaryPeriod,
  isSummaryPeriod,
  localYear,
  localYearMonth,
  readSummaryPeriod,
  writeSummaryPeriod,
} from '@/lib/expenses/summaryPeriod';

/** Local-time Date (month is 1-based here for readability). */
function local(year: number, month: number, day: number, hour = 12, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute);
}

describe('summary period — month boundaries (today = 2026-03-15)', () => {
  const today = local(2026, 3, 15);

  it.each([
    ['2026-03-01', true],
    ['2026-03-15', true],
    ['2026-03-31', true],
    ['2026-02-28', false],
    ['2026-04-01', false],
    ['2025-03-15', false], // same month, other year
  ])('%s → %s', (date, expected) => {
    expect(isInSummaryPeriod(date, 'month', today)).toBe(expected);
  });
});

describe('summary period — year boundaries (today = 2026-07-04)', () => {
  const today = local(2026, 7, 4);

  it.each([
    ['2026-01-01', true],
    ['2026-07-04', true],
    ['2026-12-31', true],
    ['2025-12-31', false],
    ['2027-01-01', false],
  ])('%s → %s', (date, expected) => {
    expect(isInSummaryPeriod(date, 'year', today)).toBe(expected);
  });
});

describe('summary period — all time', () => {
  it('accepts every date regardless of today', () => {
    const today = local(2026, 3, 15);
    for (const date of ['1999-01-01', '2026-03-15', '2099-12-31']) {
      expect(isInSummaryPeriod(date, 'all', today)).toBe(true);
    }
  });
});

describe('summary period — local-date safety', () => {
  it('uses the LOCAL calendar, never the UTC date, for today', () => {
    // 00:30 local on Jan 1: for any zone east of UTC the UTC instant is still
    // Dec 31 of the previous year; west of UTC, 23:30 local on Dec 31 is
    // already Jan 1 UTC. Both sides must follow the local wall clock.
    const justAfterMidnightJan1 = local(2026, 1, 1, 0, 30);
    expect(localYear(justAfterMidnightJan1)).toBe('2026');
    expect(localYearMonth(justAfterMidnightJan1)).toBe('2026-01');
    expect(isInSummaryPeriod('2026-01-01', 'month', justAfterMidnightJan1)).toBe(true);
    expect(isInSummaryPeriod('2025-12-31', 'month', justAfterMidnightJan1)).toBe(false);
    expect(isInSummaryPeriod('2025-12-31', 'year', justAfterMidnightJan1)).toBe(false);

    const justBeforeMidnightDec31 = local(2025, 12, 31, 23, 30);
    expect(localYear(justBeforeMidnightDec31)).toBe('2025');
    expect(localYearMonth(justBeforeMidnightDec31)).toBe('2025-12');
    expect(isInSummaryPeriod('2025-12-31', 'month', justBeforeMidnightDec31)).toBe(true);
    expect(isInSummaryPeriod('2026-01-01', 'year', justBeforeMidnightDec31)).toBe(false);
  });

  it('zero-pads single-digit months', () => {
    expect(localYearMonth(local(2026, 2, 3))).toBe('2026-02');
    expect(isInSummaryPeriod('2026-02-03', 'month', local(2026, 2, 3))).toBe(true);
  });

  it('never parses the expense date (no UTC round-trip of yyyy-mm-dd)', () => {
    // `new Date('2026-03-01')` is midnight UTC — in zones west of UTC that is
    // still Feb 28 locally. The prefix comparison must not be fooled.
    expect(isInSummaryPeriod('2026-03-01', 'month', local(2026, 3, 1, 0, 5))).toBe(true);
  });
});

describe('filterBySummaryPeriod', () => {
  const rows = [
    { id: 'm', expense_date: '2026-03-02' },
    { id: 'y', expense_date: '2026-01-20' },
    { id: 'old', expense_date: '2024-11-11' },
  ];
  const today = local(2026, 3, 15);

  it('keeps only the month / year / everything', () => {
    expect(filterBySummaryPeriod(rows, 'month', today).map((r) => r.id)).toEqual(['m']);
    expect(filterBySummaryPeriod(rows, 'year', today).map((r) => r.id)).toEqual(['m', 'y']);
    expect(filterBySummaryPeriod(rows, 'all', today).map((r) => r.id)).toEqual(['m', 'y', 'old']);
  });

  it('returns a copy for all time (callers may mutate)', () => {
    const all = filterBySummaryPeriod(rows, 'all', today);
    expect(all).not.toBe(rows);
    expect(all).toEqual(rows);
  });
});

describe('summary period — persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults to THIS MONTH', () => {
    expect(DEFAULT_SUMMARY_PERIOD).toBe('month');
    expect(SUMMARY_PERIODS).toEqual(['month', 'year', 'all']);
    expect(readSummaryPeriod()).toBe('month');
  });

  it('round-trips the chosen period through localStorage', () => {
    writeSummaryPeriod('year');
    expect(window.localStorage.getItem(SUMMARY_PERIOD_STORAGE_KEY)).toBe('year');
    expect(readSummaryPeriod()).toBe('year');
    writeSummaryPeriod('all');
    expect(readSummaryPeriod()).toBe('all');
  });

  it('falls back to the default on an unknown stored value', () => {
    window.localStorage.setItem(SUMMARY_PERIOD_STORAGE_KEY, 'quarter');
    expect(readSummaryPeriod()).toBe('month');
    expect(isSummaryPeriod('quarter')).toBe(false);
  });

  it('survives an unavailable storage', () => {
    const getItem = jest
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    const setItem = jest
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    expect(readSummaryPeriod()).toBe('month');
    expect(() => writeSummaryPeriod('all')).not.toThrow();
    getItem.mockRestore();
    setItem.mockRestore();
  });
});
