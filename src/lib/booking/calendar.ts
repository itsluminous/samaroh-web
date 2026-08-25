// Month-grid mapping for the Booking calendar (§4.1): Sunday-start weeks,
// multi-day bookings as spanning bars with lane packing, cancelled bookings
// hidden, date blocks marked per cell. Pure date-string math (no timezones —
// all dates are ISO yyyy-mm-dd handled via Date.UTC).

import type { Booking, DateBlock } from './types';

export interface DayCell {
  iso: string; // yyyy-mm-dd
  day: number; // 1..31
  inMonth: boolean;
  blocked: boolean;
}

export interface WeekSegment {
  booking: Booking;
  /** 0-based column of the segment start within the week. */
  startCol: number;
  /** Number of columns the segment spans (1..7). */
  span: number;
  /** True when the booking started before this week (bar continues left). */
  continuesLeft: boolean;
  /** True when the booking ends after this week (bar continues right). */
  continuesRight: boolean;
  /** 0-based stacking lane within the week row. */
  lane: number;
}

export interface CalendarWeek {
  days: DayCell[];
  segments: WeekSegment[];
  laneCount: number;
}

export function toIso(year: number, month0: number, day: number): string {
  const mm = String(month0 + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export function addDays(iso: string, days: number): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  const nd = new Date(Date.UTC(y, m - 1, d + days));
  return toIso(nd.getUTCFullYear(), nd.getUTCMonth(), nd.getUTCDate());
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** Inclusive ISO-date range overlap. */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && aEnd >= bStart;
}

export function isDateBlocked(
  iso: string,
  blocks: Pick<DateBlock, 'start_date' | 'end_date' | 'deleted_at'>[],
): boolean {
  return blocks.some((b) => b.deleted_at === null && b.start_date <= iso && b.end_date >= iso);
}

/** First and last ISO dates of a month. */
export function monthRange(year: number, month0: number): { start: string; end: string } {
  return { start: toIso(year, month0, 1), end: toIso(year, month0, daysInMonth(year, month0)) };
}

/**
 * Builds the Sunday-start week rows of the month view. Leading/trailing cells
 * come from the neighbour months (inMonth=false) so every row has 7 cells.
 */
export function buildMonthWeeks(
  year: number,
  month0: number,
  bookings: Booking[],
  blocks: DateBlock[],
): CalendarWeek[] {
  const first = toIso(year, month0, 1);
  const firstDow = new Date(`${first}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const gridStart = addDays(first, -firstDow);
  const totalDays = daysInMonth(year, month0);
  const weekCount = Math.ceil((firstDow + totalDays) / 7);

  const visible = bookings.filter((b) => b.deleted_at === null && b.status !== 'cancelled');

  const weeks: CalendarWeek[] = [];
  for (let w = 0; w < weekCount; w++) {
    const days: DayCell[] = [];
    for (let c = 0; c < 7; c++) {
      const iso = addDays(gridStart, w * 7 + c);
      const day = Number(iso.slice(8));
      const inMonth = iso.slice(0, 7) === first.slice(0, 7);
      days.push({ iso, day, inMonth, blocked: isDateBlocked(iso, blocks) });
    }
    const weekStart = days[0]?.iso ?? '';
    const weekEnd = days[6]?.iso ?? '';

    // Segments: clip each overlapping booking to this week, then pack lanes
    // greedily (sorted by start then longer-first for stable stacking).
    const overlapping = visible
      .filter((b) => rangesOverlap(b.start_date, b.end_date, weekStart, weekEnd))
      .sort((a, b) =>
        a.start_date === b.start_date
          ? b.end_date.localeCompare(a.end_date)
          : a.start_date.localeCompare(b.start_date),
      );

    const laneEnds: string[] = []; // per lane: last occupied end date (clipped)
    const segments: WeekSegment[] = [];
    for (const b of overlapping) {
      const segStart = b.start_date < weekStart ? weekStart : b.start_date;
      const segEnd = b.end_date > weekEnd ? weekEnd : b.end_date;
      const startCol = days.findIndex((d) => d.iso === segStart);
      const endCol = days.findIndex((d) => d.iso === segEnd);
      let lane = laneEnds.findIndex((end) => end < segStart);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(segEnd);
      } else {
        laneEnds[lane] = segEnd;
      }
      segments.push({
        booking: b,
        startCol,
        span: endCol - startCol + 1,
        continuesLeft: b.start_date < weekStart,
        continuesRight: b.end_date > weekEnd,
        lane,
      });
    }
    weeks.push({ days, segments, laneCount: laneEnds.length });
  }
  return weeks;
}

/** Non-cancelled bookings covering the given date (for tap-on-date handling). */
export function bookingsOnDate(iso: string, bookings: Booking[]): Booking[] {
  return bookings.filter(
    (b) =>
      b.deleted_at === null &&
      b.status !== 'cancelled' &&
      b.start_date <= iso &&
      b.end_date >= iso,
  );
}

export function todayIso(): string {
  const now = new Date();
  return toIso(now.getFullYear(), now.getMonth(), now.getDate());
}
