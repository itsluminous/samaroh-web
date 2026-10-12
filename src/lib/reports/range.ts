/**
 * Reports date-range quick filter — range math
 * (shared/docs/reports-range-filter.md, 2026-10-12). Pure ISO-date string
 * functions on the DEVICE-LOCAL calendar (same "today" rule as the expenses
 * summary period, ADR-091): never `toISOString()`, never `Date` month
 * overflow — month arithmetic clamps to the target month's last day
 * (`Jan 31 + 1 month = Feb 28/29`, like Java `LocalDate.plusMonths`).
 */
import type { DateRange } from './types';

/** Chip ids, in display order; `custom` is the from–to picker. */
export const RANGE_PRESETS = ['minus_12m', 'minus_3m', 'this_month', 'plus_3m', 'plus_12m'] as const;

export type QuickRangePreset = (typeof RANGE_PRESETS)[number];
export type RangePreset = QuickRangePreset | 'custom';

/** Both platforms default to the trailing 12 months (ending TODAY). */
export const DEFAULT_RANGE_PRESET: QuickRangePreset = 'minus_12m';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toIso(year: number, month1: number, day: number): string {
  return `${year}-${pad2(month1)}-${pad2(day)}`;
}

/** Days in a (year, 1-based month) — Date.UTC day 0 of the next month. */
export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** Device-local today as yyyy-mm-dd (Date getters, not toISOString). */
export function localTodayIso(now: Date = new Date()): string {
  return toIso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/**
 * `iso ± months`, same day-of-month, clamped to the last day of the target
 * month when that day does not exist. Pure integer math on the ISO parts.
 */
export function addMonthsClamped(iso: string, months: number): string {
  const year = Number(iso.slice(0, 4));
  const month1 = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  const total = year * 12 + (month1 - 1) + months;
  const targetYear = Math.floor(total / 12);
  const targetMonth1 = (total - targetYear * 12) + 1;
  return toIso(targetYear, targetMonth1, Math.min(day, daysInMonth(targetYear, targetMonth1)));
}

/** First and last day of the calendar month containing `iso`. */
export function monthBounds(iso: string): DateRange {
  const year = Number(iso.slice(0, 4));
  const month1 = Number(iso.slice(5, 7));
  return { start: toIso(year, month1, 1), end: toIso(year, month1, daysInMonth(year, month1)) };
}

/**
 * The contract table (inclusive ends, device-local `today`):
 *   minus_N   → today − N months … today
 *   this_month→ 1st … last day of the current calendar month
 *   plus_N    → today … today + N months
 */
export function presetRange(preset: QuickRangePreset, todayIso: string = localTodayIso()): DateRange {
  switch (preset) {
    case 'minus_12m':
      return { start: addMonthsClamped(todayIso, -12), end: todayIso };
    case 'minus_3m':
      return { start: addMonthsClamped(todayIso, -3), end: todayIso };
    case 'this_month':
      return monthBounds(todayIso);
    case 'plus_3m':
      return { start: todayIso, end: addMonthsClamped(todayIso, 3) };
    case 'plus_12m':
      return { start: todayIso, end: addMonthsClamped(todayIso, 12) };
  }
}

export function isQuickRangePreset(value: unknown): value is QuickRangePreset {
  return typeof value === 'string' && (RANGE_PRESETS as readonly string[]).includes(value);
}
