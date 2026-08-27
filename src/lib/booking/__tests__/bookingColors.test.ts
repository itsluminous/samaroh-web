// Booking color palette contract + pill paint mapping (shared/booking-colors.json).

import { BOOKING_COLORS, findBookingColor, pillPaint } from '../bookingColors';

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

describe('pillPaint (calendar pill color mapping)', () => {
  it('tentative keeps the outlined-amber treatment even when a color is set', () => {
    expect(pillPaint({ status: 'tentative', color: 'tomato' })).toEqual({ kind: 'tentative' });
    expect(pillPaint({ status: 'tentative', color: null })).toEqual({ kind: 'tentative' });
  });

  it('confirmed booking with a palette color paints hex + on-color', () => {
    expect(pillPaint({ status: 'confirmed', color: 'blueberry' })).toEqual({
      kind: 'custom',
      bg: '#1967D2',
      fg: '#FFFFFF',
    });
  });

  it('null color falls back to the themed default (purple)', () => {
    expect(pillPaint({ status: 'confirmed', color: null })).toEqual({ kind: 'themed' });
    expect(pillPaint({ status: 'completed', color: null })).toEqual({ kind: 'themed' });
  });

  it('unknown color key degrades gracefully to the themed default', () => {
    expect(pillPaint({ status: 'confirmed', color: 'neon-zebra' })).toEqual({ kind: 'themed' });
  });
});
