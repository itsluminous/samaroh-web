// Booking color palette contract + effective-color fallback chain
// (shared/booking-colors.json + shared/event-types.json):
// explicit bookings.color → event-type default → themed purple.

import type { EventTypePreset } from '../eventTypePresets';
import {
  BOOKING_COLORS,
  effectiveBookingColor,
  eventTypeDefaultColor,
  findBookingColor,
  pillPaint,
} from '../bookingColors';

describe('booking color palette (shared contract)', () => {
  it('parses 16 swatches from shared/booking-colors.json', () => {
    expect(BOOKING_COLORS).toHaveLength(16);
  });

  it('has unique keys', () => {
    const keys = BOOKING_COLORS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every entry has valid hex, on_hex and a booking.color.* label key', () => {
    for (const c of BOOKING_COLORS) {
      expect(c.hex).toMatch(/^#[0-9A-F]{6}$/i);
      expect(c.on_hex).toMatch(/^#[0-9A-F]{6}$/i);
      expect(c.label_key).toBe(`booking.color.${c.key}`);
    }
  });

  it('findBookingColor resolves known keys and rejects null/unknown', () => {
    expect(findBookingColor('sage')?.hex).toBe('#33B679');
    expect(findBookingColor(null)).toBeUndefined();
    expect(findBookingColor(undefined)).toBeUndefined();
    expect(findBookingColor('not-a-color')).toBeUndefined();
  });
});

describe('eventTypeDefaultColor (per-type default from the shared contract)', () => {
  it('resolves built-in event types to their contract default swatch', () => {
    expect(eventTypeDefaultColor('wedding')?.key).toBe('tomato');
    expect(eventTypeDefaultColor('room_booking')?.key).toBe('blueberry');
  });

  it('custom free-text event types have no type default', () => {
    expect(eventTypeDefaultColor('Mehndi Night')).toBeUndefined();
    expect(eventTypeDefaultColor('')).toBeUndefined();
  });
});

describe('effectiveBookingColor (fallback chain)', () => {
  it('explicit bookings.color wins over the event-type default', () => {
    expect(effectiveBookingColor({ color: 'sage', event_type: 'wedding' })?.key).toBe('sage');
  });

  it('null color falls back to the event-type default', () => {
    expect(effectiveBookingColor({ color: null, event_type: 'wedding' })?.key).toBe('tomato');
    expect(effectiveBookingColor({ color: null, event_type: 'birthday' })?.key).toBe('banana');
  });

  it('unknown explicit color key falls back to the event-type default', () => {
    expect(effectiveBookingColor({ color: 'neon-zebra', event_type: 'tilak' })?.key).toBe(
      'tangerine',
    );
  });

  it('custom free-text type with no explicit color → undefined (themed default)', () => {
    expect(effectiveBookingColor({ color: null, event_type: 'Mehndi Night' })).toBeUndefined();
  });

  it('custom free-text type with an explicit color still uses it', () => {
    expect(effectiveBookingColor({ color: 'peacock', event_type: 'Mehndi Night' })?.key).toBe(
      'peacock',
    );
  });
});

describe('pillPaint (calendar pill color mapping)', () => {
  it('tentative keeps the outlined-amber treatment even when a color would apply', () => {
    expect(pillPaint({ status: 'tentative', color: 'tomato', event_type: 'wedding' })).toEqual({
      kind: 'tentative',
    });
    expect(pillPaint({ status: 'tentative', color: null, event_type: 'wedding' })).toEqual({
      kind: 'tentative',
    });
    expect(pillPaint({ status: 'tentative', color: null, event_type: 'Mehndi Night' })).toEqual({
      kind: 'tentative',
    });
  });

  it('confirmed booking with an explicit palette color paints hex + on-color', () => {
    expect(pillPaint({ status: 'confirmed', color: 'blueberry', event_type: 'wedding' })).toEqual({
      kind: 'custom',
      bg: '#1967D2',
      fg: '#FFFFFF',
    });
  });

  it('null color paints the event-type default', () => {
    expect(pillPaint({ status: 'confirmed', color: null, event_type: 'wedding' })).toEqual({
      kind: 'custom',
      bg: '#C62828',
      fg: '#FFFFFF',
    });
  });

  it('custom free-text type with no explicit color → themed default', () => {
    expect(pillPaint({ status: 'confirmed', color: null, event_type: 'Mehndi Night' })).toEqual({
      kind: 'themed',
    });
    expect(pillPaint({ status: 'completed', color: null, event_type: 'Sangeet' })).toEqual({
      kind: 'themed',
    });
  });

  it('unknown color key on a free-text type degrades gracefully to themed', () => {
    expect(pillPaint({ status: 'confirmed', color: 'neon-zebra', event_type: 'Sangeet' })).toEqual({
      kind: 'themed',
    });
  });
});

// ---------- presets-based resolution (event_types table, migration 006) ----------


function makePreset(overrides: Partial<EventTypePreset>): EventTypePreset {
  return {
    id: 'p-x',
    business_id: 'biz-1',
    label: 'X',
    icon: '\u2728',
    color: null,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

describe('eventTypeDefaultColor from the business presets (label match → colour key → hex)', () => {
  const presets = [
    makePreset({ id: 'p1', label: 'Shaadi', color: 'tomato' }),
    makePreset({ id: 'p2', label: 'Mehndi Night', color: 'fuchsia' }),
    makePreset({ id: 'p3', label: 'Farewell', color: null }),
    makePreset({ id: 'p4', label: 'Future Type', color: 'not-a-color' }),
  ];

  it('label match resolves the preset colour key to the palette hex', () => {
    expect(eventTypeDefaultColor('Shaadi', presets)?.key).toBe('tomato');
    expect(eventTypeDefaultColor('Shaadi', presets)?.hex).toBe('#C62828');
    expect(eventTypeDefaultColor('Mehndi Night', presets)?.key).toBe('fuchsia');
  });

  it('label matching is case-insensitive (snapshot vs preset)', () => {
    expect(eventTypeDefaultColor('shaadi', presets)?.key).toBe('tomato');
  });

  it('preset with colour null → themed default (undefined)', () => {
    expect(eventTypeDefaultColor('Farewell', presets)).toBeUndefined();
  });

  it('preset with an unknown colour key from a newer contract → themed default', () => {
    expect(eventTypeDefaultColor('Future Type', presets)).toBeUndefined();
  });

  it('no matching preset and no legacy key → themed default', () => {
    expect(eventTypeDefaultColor('Sangeet', presets)).toBeUndefined();
  });

  it('legacy built-in KEY still resolves via the static contract when no preset matches', () => {
    // Pre-006 booking snapshot 'wedding' with the seeded preset renamed away.
    expect(eventTypeDefaultColor('wedding', presets)?.key).toBe('tomato');
    expect(eventTypeDefaultColor('room_booking', presets)?.key).toBe('blueberry');
  });

  it('legacy built-in KEY prefers a matching live preset over the static contract', () => {
    const seeded = [makePreset({ id: 'p5', label: 'Room Booking', color: 'sage' })];
    expect(eventTypeDefaultColor('room_booking', seeded)?.key).toBe('sage');
  });
});

describe('effectiveBookingColor / pillPaint with presets', () => {
  const presets = [makePreset({ id: 'p1', label: 'Shaadi', color: 'tomato' })];

  it('explicit bookings.color still wins over the preset default', () => {
    expect(effectiveBookingColor({ color: 'sage', event_type: 'Shaadi' }, presets)?.key).toBe('sage');
  });

  it('null color falls back to the preset default and paints the pill', () => {
    expect(pillPaint({ status: 'confirmed', color: null, event_type: 'Shaadi' }, presets)).toEqual({
      kind: 'custom',
      bg: '#C62828',
      fg: '#FFFFFF',
    });
  });

  it('renamed/deleted preset → themed pill for the old snapshot', () => {
    expect(pillPaint({ status: 'confirmed', color: null, event_type: 'Old Label' }, presets)).toEqual({
      kind: 'themed',
    });
  });

  it('tentative stays outlined-amber regardless of preset colours', () => {
    expect(pillPaint({ status: 'tentative', color: null, event_type: 'Shaadi' }, presets)).toEqual({
      kind: 'tentative',
    });
  });
});
