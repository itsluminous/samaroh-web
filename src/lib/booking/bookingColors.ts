// Curated booking colors from the shared contract (shared/booking-colors.json).
// `key` is stored in bookings.color (NULL = default themed look), `hex` is the
// swatch/fill color, `on_hex` is the legible text color on top of it (all
// pairs meet WCAG AA), `label_key` resolves the localized color name.

import bookingColorsJson from '../../../shared/booking-colors.json';
import type { Booking } from './types';

export interface BookingColorDef {
  key: string;
  hex: string;
  on_hex: string;
  label_key: string;
}

export const BOOKING_COLORS: BookingColorDef[] = bookingColorsJson.colors;

/** Resolves a stored bookings.color key; null/unknown keys → undefined (default look). */
export function findBookingColor(key: string | null | undefined): BookingColorDef | undefined {
  return key == null ? undefined : BOOKING_COLORS.find((c) => c.key === key);
}

/**
 * How a calendar pill / spanning bar should be painted:
 * - tentative bookings keep their outlined-amber treatment regardless of color;
 * - a valid color key paints the pill with the palette hex + on-color;
 * - null (or an unknown key, e.g. from a newer contract) falls back to the
 *   themed default (primary purple).
 */
export type PillPaint =
  | { kind: 'tentative' }
  | { kind: 'themed' }
  | { kind: 'custom'; bg: string; fg: string };

export function pillPaint(booking: Pick<Booking, 'status' | 'color'>): PillPaint {
  if (booking.status === 'tentative') {
    return { kind: 'tentative' };
  }
  const def = findBookingColor(booking.color);
  return def ? { kind: 'custom', bg: def.hex, fg: def.on_hex } : { kind: 'themed' };
}
