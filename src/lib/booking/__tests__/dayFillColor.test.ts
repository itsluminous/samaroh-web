// Calendar day colour — the one rule both platforms share
// (shared/docs/calendar-day-color.md). The contract's test table, verbatim,
// plus the ADR-041 marker hand-off through visibleCalendarBookings.

import { bookingsOnDate, visibleCalendarBookings } from '../calendar';
import { BOOKING_COLORS, dayFillColor, paletteIndex } from '../bookingColors';
import type { Booking } from '../types';

let seq = 0;
function b(color: string | null, status: Booking['status'] = 'confirmed', eventType = 'Custom'): Booking {
  seq += 1;
  return {
    id: `b${seq}`,
    business_id: 'biz',
    event_type: eventType, // free text → no type default, so `color` is the effective colour
    event_icon: '',
    customer_name: 'X',
    customer_phone: null,
    start_date: '2026-07-10',
    end_date: '2026-07-10',
    start_time: null,
    end_time: null,
    total_amount: 0,
    security_deposit: 0,
    source: null,
    notes: null,
    status,
    color,
    invoice_number: null,
    created_by: 'u',
    updated_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
  };
}

const key = (def: ReturnType<typeof dayFillColor>) => (def === null ? 'none' : def === undefined ? 'themed' : def.key);

describe('dayFillColor — contract table', () => {
  it.each([
    ['one firm red', [b('tomato')], 'tomato'],
    ['two firm red', [b('tomato'), b('tomato')], 'tomato'],
    ['red + sage', [b('sage'), b('tomato')], 'tomato'],
    ['sage + graphite', [b('graphite'), b('sage')], 'sage'],
    ['sage + null (type without colour)', [b(null), b('sage')], 'sage'],
    ['null + null', [b(null), b(null)], 'themed'],
    ['red + tentative(any)', [b('tomato'), b('sage', 'tentative')], 'tomato'],
    ['tentative only', [b('sage', 'tentative'), b('tomato', 'tentative')], 'none'],
  ])('%s → %s', (_name, covering, expected) => {
    expect(key(dayFillColor(covering))).toBe(expected);
  });

  it('never blends: the result is always exactly one palette def (or none/themed)', () => {
    const def = dayFillColor([b('tomato'), b('sage'), b('graphite'), b(null)]);
    expect(def).toBe(BOOKING_COLORS.find((c) => c.key === 'tomato'));
    expect(def?.on_hex).toBe(BOOKING_COLORS[0]?.on_hex); // on-colour follows the winning fill
  });

  it('status does not rank among firm bookings (completed vs confirmed look the same)', () => {
    expect(key(dayFillColor([b('sage', 'completed'), b('graphite', 'confirmed')]))).toBe('sage');
    expect(key(dayFillColor([b('graphite', 'completed'), b('sage', 'confirmed')]))).toBe('sage');
  });

  it('empty input → no fill', () => {
    expect(dayFillColor([])).toBeNull();
  });

  it('severity = booking-colors.json order (tomato first … graphite last; null after everything)', () => {
    expect(paletteIndex('tomato')).toBe(0);
    expect(paletteIndex('graphite')).toBe(BOOKING_COLORS.length - 1);
    expect(paletteIndex('tomato')).toBeLessThan(paletteIndex('sage'));
    expect(paletteIndex('sage')).toBeLessThan(paletteIndex('graphite'));
    expect(paletteIndex('unknown-from-newer-contract')).toBe(BOOKING_COLORS.length);
  });

  it('marker red + real sage → sage (marker loses the date under the ADR-041 rule)', () => {
    const marker = b('tomato', 'confirmed', 'Lagan');
    const real = b('sage');
    const shown = visibleCalendarBookings([marker, real], (x) => x.event_type === 'Lagan');
    expect(key(dayFillColor(bookingsOnDate('2026-07-10', shown)))).toBe('sage');
    // Marker-only date keeps its own colour.
    const alone = visibleCalendarBookings([marker], (x) => x.event_type === 'Lagan');
    expect(key(dayFillColor(bookingsOnDate('2026-07-10', alone)))).toBe('tomato');
  });

  it('cancelled bookings never take part (filtered by bookingsOnDate)', () => {
    const covering = bookingsOnDate('2026-07-10', [b('tomato', 'cancelled'), b('sage')]);
    expect(key(dayFillColor(covering))).toBe('sage');
  });
});
