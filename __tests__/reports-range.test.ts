/**
 * Reports quick-filter range math (shared docs/reports-range-filter.md):
 * −12m/−3m end TODAY, +3m/+12m start TODAY, This month = whole calendar
 * month, inclusive ends, device-local today, month arithmetic clamped to the
 * month end (no Date overflow). Same table as Android's RangePreset tests.
 */
import {
  addMonthsClamped,
  DEFAULT_RANGE_PRESET,
  daysInMonth,
  isQuickRangePreset,
  localTodayIso,
  monthBounds,
  presetRange,
  RANGE_PRESETS,
} from '@/lib/reports/range';

describe('reports range presets', () => {
  it('lists the chips in the contract order with −12 months as the default', () => {
    expect(RANGE_PRESETS).toEqual(['minus_12m', 'minus_3m', 'this_month', 'plus_3m', 'plus_12m']);
    expect(DEFAULT_RANGE_PRESET).toBe('minus_12m');
    expect(isQuickRangePreset('plus_3m')).toBe(true);
    expect(isQuickRangePreset('last_12_months')).toBe(false); // deprecated id, never produced
    expect(isQuickRangePreset('custom')).toBe(false);
  });

  it.each([
    ['minus_12m', '2026-10-12', { start: '2025-10-12', end: '2026-10-12' }],
    ['minus_3m', '2026-10-12', { start: '2026-07-12', end: '2026-10-12' }],
    ['this_month', '2026-10-12', { start: '2026-10-01', end: '2026-10-31' }],
    ['plus_3m', '2026-10-12', { start: '2026-10-12', end: '2027-01-12' }],
    ['plus_12m', '2026-10-12', { start: '2026-10-12', end: '2027-10-12' }],
  ] as const)('%s on %s', (preset, today, expected) => {
    expect(presetRange(preset, today)).toEqual(expected);
  });

  it('backward ranges END today (not end of month) and forward ranges START today', () => {
    expect(presetRange('minus_12m', '2026-10-05').end).toBe('2026-10-05');
    expect(presetRange('plus_12m', '2026-10-05').start).toBe('2026-10-05');
  });

  it('This month covers the whole calendar month incl. a 29-day February', () => {
    expect(presetRange('this_month', '2028-02-10')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    expect(monthBounds('2026-12-31')).toEqual({ start: '2026-12-01', end: '2026-12-31' });
  });

  it('defaults to the device-local today', () => {
    const today = localTodayIso();
    expect(presetRange('minus_3m')).toMatchObject({ end: today });
    expect(presetRange('plus_3m')).toMatchObject({ start: today });
  });
});

describe('addMonthsClamped (no Date overflow)', () => {
  it.each([
    ['2026-01-31', 1, '2026-02-28'], // Jan 31 + 1 → Feb 28, never Mar 3
    ['2028-01-31', 1, '2028-02-29'], // leap year
    ['2026-03-31', -1, '2026-02-28'],
    ['2026-05-31', -3, '2026-02-28'],
    ['2026-08-31', 3, '2026-11-30'],
    ['2026-10-12', -12, '2025-10-12'],
    ['2026-02-28', 12, '2027-02-28'],
    ['2024-02-29', 12, '2025-02-28'], // leap day − 12 months lands on the clamp
    ['2026-01-15', -13, '2024-12-15'], // year roll-over backwards
    ['2026-12-15', 1, '2027-01-15'], // year roll-over forwards
    ['2026-10-12', 0, '2026-10-12'],
  ])('%s %+d months → %s', (iso, months, expected) => {
    expect(addMonthsClamped(iso, months)).toBe(expected);
  });

  it('daysInMonth handles leap years', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe('localTodayIso is device-local, not UTC', () => {
  it('uses local getters (23:30 IST stays today even though UTC is tomorrow)', () => {
    // Build a Date whose LOCAL fields are 2026-10-12 23:30 regardless of TZ.
    const local = new Date(2026, 9, 12, 23, 30);
    expect(localTodayIso(local)).toBe('2026-10-12');
    // yyyy-mm-01 at 00:30 local never becomes the previous day.
    expect(localTodayIso(new Date(2026, 9, 1, 0, 30))).toBe('2026-10-01');
  });
});
