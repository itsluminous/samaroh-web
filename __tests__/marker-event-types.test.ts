/**
 * Marker-kind event types (event_types.kind, parity with the shared
 * contract): kind resolution for stored bookings, seed/fallback carry-through,
 * month-grid marker suppression on shared dates, and the analytics exclusion.
 */
import { visibleCalendarBookings } from '@/lib/booking/calendar';
import {
  buildEventTypeSeedRows,
  fallbackPresets,
  presetKindForType,
  type EventTypePreset,
} from '@/lib/booking/eventTypePresets';
import { EVENT_TYPES } from '@/lib/booking/eventTypes';
import { eventTypeBreakdown } from '@/lib/reports/compute';
import type { ReportBooking } from '@/lib/reports/types';
import { makeBooking } from '../test-utils/fixtures';

function makePreset(overrides: Partial<EventTypePreset>): EventTypePreset {
  return {
    id: 'p-x',
    business_id: 'biz-1',
    label: 'X',
    icon: '\u2728',
    color: null,
    kind: 'booking',
    sort_order: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

describe('presetKindForType', () => {
  const presets = [
    makePreset({ id: 'p1', label: 'Wedding', kind: 'booking' }),
    makePreset({ id: 'p2', label: 'Lagan', kind: 'marker' }),
  ];

  it('resolves the live preset kind by label snapshot', () => {
    expect(presetKindForType(presets, 'Lagan')).toBe('marker');
    expect(presetKindForType(presets, 'Wedding')).toBe('booking');
  });

  it('legacy built-in keys resolve through the static contract', () => {
    expect(presetKindForType(null, 'lagan')).toBe('marker');
    expect(presetKindForType(null, 'tilak')).toBe('marker');
    expect(presetKindForType(null, 'wedding')).toBe('booking');
  });

  it('unknown types default to booking (schema contract: absent → booking)', () => {
    expect(presetKindForType(presets, 'Farmhouse Party')).toBe('booking');
    expect(presetKindForType(null, 'Farmhouse Party')).toBe('booking');
  });
});

describe('seed template carries kind through', () => {
  const translate = (key: string) => key;

  it('buildEventTypeSeedRows preserves each template kind (guest Dexie included)', () => {
    const rows = buildEventTypeSeedRows('biz-1', translate);
    expect(rows).toHaveLength(EVENT_TYPES.length);
    for (const [i, et] of EVENT_TYPES.entries()) {
      expect(rows[i]).toMatchObject({ kind: et.kind });
    }
    // The contract flags Lagan and Tilak as markers.
    const kinds = new Map(rows.map((r) => [r.label as string, r.kind as string]));
    expect(kinds.get('booking.event_type.lagan')).toBe('marker');
    expect(kinds.get('booking.event_type.tilak')).toBe('marker');
    expect(kinds.get('booking.event_type.wedding')).toBe('booking');
  });

  it('fallbackPresets carry kind', () => {
    const fallback = fallbackPresets(translate);
    const lagan = fallback.find((p) => p.label === 'booking.event_type.lagan');
    expect(lagan?.kind).toBe('marker');
    expect(fallback.find((p) => p.label === 'booking.event_type.wedding')?.kind).toBe('booking');
  });
});

describe('visibleCalendarBookings (month grid marker suppression)', () => {
  const isMarker = (b: { event_type: string }) => b.event_type === 'Lagan';

  it('hides a marker whose whole span also has a real booking', () => {
    const real = makeBooking({ event_type: 'Wedding', start_date: '2026-07-10', end_date: '2026-07-12' });
    const marker = makeBooking({ event_type: 'Lagan', start_date: '2026-07-10', end_date: '2026-07-10' });
    const visible = visibleCalendarBookings([real, marker], isMarker);
    expect(visible.map((b) => b.id)).toEqual([real.id]);
  });

  it('keeps a marker on a marker-only date', () => {
    const real = makeBooking({ event_type: 'Wedding', start_date: '2026-07-10', end_date: '2026-07-10' });
    const marker = makeBooking({ event_type: 'Lagan', start_date: '2026-07-15', end_date: '2026-07-15' });
    const visible = visibleCalendarBookings([real, marker], isMarker);
    expect(visible).toHaveLength(2);
  });

  it('keeps a marker only partially covered by real bookings', () => {
    const real = makeBooking({ event_type: 'Wedding', start_date: '2026-07-10', end_date: '2026-07-10' });
    const marker = makeBooking({ event_type: 'Lagan', start_date: '2026-07-10', end_date: '2026-07-11' });
    const visible = visibleCalendarBookings([real, marker], isMarker);
    expect(visible).toHaveLength(2);
  });

  it('cancelled real bookings do not suppress markers', () => {
    const cancelled = makeBooking({
      event_type: 'Wedding',
      status: 'cancelled',
      start_date: '2026-07-10',
      end_date: '2026-07-10',
    });
    const marker = makeBooking({ event_type: 'Lagan', start_date: '2026-07-10', end_date: '2026-07-10' });
    const visible = visibleCalendarBookings([cancelled, marker], isMarker);
    expect(visible.map((b) => b.id)).toEqual(expect.arrayContaining([marker.id]));
  });

  it('no markers → the input array is returned untouched', () => {
    const bookings = [makeBooking({ event_type: 'Wedding' })];
    expect(visibleCalendarBookings(bookings, isMarker)).toBe(bookings);
  });
});

describe('eventTypeBreakdown excludes marker-kind types', () => {
  const report = (overrides: Partial<ReportBooking>): ReportBooking => ({
    id: `r-${Math.random()}`,
    customer_name: 'X',
    event_type: 'Wedding',
    event_icon: '\u{1F492}',
    start_date: '2026-07-10',
    end_date: '2026-07-10',
    total_amount: 50000,
    status: 'confirmed',
    source: null,
    ...overrides,
  });

  it('marker bookings contribute neither count nor revenue', () => {
    const bookings = [
      report({ event_type: 'Wedding', total_amount: 80000 }),
      report({ event_type: 'Lagan', total_amount: 0 }),
      report({ event_type: 'Lagan', total_amount: 0 }),
    ];
    const rows = eventTypeBreakdown(bookings, (t) => t === 'Lagan');
    expect(rows).toEqual([{ key: 'Wedding', count: 1, revenue: 80000 }]);
  });

  it('without a predicate the breakdown is unchanged (back-compat)', () => {
    const bookings = [report({ event_type: 'Lagan' })];
    expect(eventTypeBreakdown(bookings)).toHaveLength(1);
  });
});
