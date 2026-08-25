// Month-grid mapping (§4.1): week shape, neighbour-month padding, multi-day
// spanning across week boundaries, status handling, lane packing, blocks.

import { buildMonthWeeks, bookingsOnDate, monthRange, toIso } from '@/lib/booking/calendar';
import { makeBlock, makeBooking } from '../test-utils/fixtures';

describe('buildMonthWeeks', () => {
  it('produces Sunday-start weeks of 7 with neighbour-month padding (July 2026)', () => {
    // 1 July 2026 is a Wednesday → 3 leading June cells; 31 July is a Friday.
    const weeks = buildMonthWeeks(2026, 6, [], []);
    expect(weeks).toHaveLength(5);
    for (const week of weeks) {
      expect(week.days).toHaveLength(7);
    }
    expect(weeks[0]!.days[0]!).toMatchObject({ iso: '2026-06-28', inMonth: false });
    expect(weeks[0]!.days[3]!).toMatchObject({ iso: '2026-07-01', inMonth: true, day: 1 });
    expect(weeks[4]!.days[6]!).toMatchObject({ iso: '2026-08-01', inMonth: false });
  });

  it('renders a single-day booking as one 1-column segment', () => {
    const booking = makeBooking({ start_date: '2026-07-10', end_date: '2026-07-10' });
    const weeks = buildMonthWeeks(2026, 6, [booking], []);
    const segments = weeks.flatMap((w) => w.segments);
    expect(segments).toHaveLength(1);
    // 10 July 2026 is a Friday → column 5 in the second week.
    expect(segments[0]!).toMatchObject({ startCol: 5, span: 1, continuesLeft: false, continuesRight: false });
  });

  it('splits a multi-day booking across week boundaries with continue flags', () => {
    // Fri 10 July → Tue 14 July spans two week rows.
    const booking = makeBooking({ start_date: '2026-07-10', end_date: '2026-07-14' });
    const weeks = buildMonthWeeks(2026, 6, [booking], []);
    const segments = weeks.flatMap((w) => w.segments);
    expect(segments).toHaveLength(2);
    expect(segments[0]!).toMatchObject({ startCol: 5, span: 2, continuesLeft: false, continuesRight: true });
    expect(segments[1]!).toMatchObject({ startCol: 0, span: 3, continuesLeft: true, continuesRight: false });
  });

  it('hides cancelled bookings from the grid entirely', () => {
    const cancelled = makeBooking({ status: 'cancelled', start_date: '2026-07-10', end_date: '2026-07-12' });
    const weeks = buildMonthWeeks(2026, 6, [cancelled], []);
    expect(weeks.flatMap((w) => w.segments)).toHaveLength(0);
  });

  it('keeps tentative and confirmed bookings and packs overlaps into separate lanes', () => {
    const a = makeBooking({ start_date: '2026-07-10', end_date: '2026-07-11', status: 'confirmed' });
    const b = makeBooking({ start_date: '2026-07-10', end_date: '2026-07-10', status: 'tentative' });
    const weeks = buildMonthWeeks(2026, 6, [a, b], []);
    const week = weeks.find((w) => w.segments.length > 0)!;
    expect(week.segments).toHaveLength(2);
    const lanes = new Set(week.segments.map((s) => s.lane));
    expect(lanes.size).toBe(2);
    expect(week.laneCount).toBe(2);
  });

  it('reuses a lane once the earlier booking has ended', () => {
    const a = makeBooking({ start_date: '2026-07-05', end_date: '2026-07-06' });
    const b = makeBooking({ start_date: '2026-07-08', end_date: '2026-07-09' });
    const weeks = buildMonthWeeks(2026, 6, [a, b], []);
    const week = weeks.find((w) => w.segments.length === 2)!;
    expect(week.segments.every((s) => s.lane === 0)).toBe(true);
  });

  it('marks blocked dates on the day cells', () => {
    const block = makeBlock({ start_date: '2026-07-20', end_date: '2026-07-21' });
    const weeks = buildMonthWeeks(2026, 6, [], [block]);
    const days = weeks.flatMap((w) => w.days);
    expect(days.find((d) => d.iso === '2026-07-20')!.blocked).toBe(true);
    expect(days.find((d) => d.iso === '2026-07-21')!.blocked).toBe(true);
    expect(days.find((d) => d.iso === '2026-07-22')!.blocked).toBe(false);
  });
});

describe('date helpers', () => {
  it('computes month ranges incl. leap February', () => {
    expect(monthRange(2026, 6)).toEqual({ start: '2026-07-01', end: '2026-07-31' });
    expect(monthRange(2028, 1)).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    expect(toIso(2026, 0, 5)).toBe('2026-01-05');
  });

  it('finds bookings covering a date, excluding cancelled', () => {
    const active = makeBooking({ start_date: '2026-07-10', end_date: '2026-07-12' });
    const cancelled = makeBooking({ start_date: '2026-07-11', end_date: '2026-07-11', status: 'cancelled' });
    expect(bookingsOnDate('2026-07-11', [active, cancelled])).toEqual([active]);
    expect(bookingsOnDate('2026-07-13', [active, cancelled])).toEqual([]);
  });
});
