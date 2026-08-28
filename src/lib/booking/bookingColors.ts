// Curated booking colors from the shared contract (shared/booking-colors.json).
// `key` is stored in bookings.color (NULL = default themed look), `hex` is the
// swatch/fill color, `on_hex` is the legible text color on top of it (all
// pairs meet WCAG AA), `label_key` resolves the localized color name.

import bookingColorsJson from '../../../shared/booking-colors.json';
import { presetColorKey, type EventTypePreset } from './eventTypePresets';
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
 * Default palette color for a stored bookings.event_type, resolved from the
 * business's live presets (event_types table): label match → the preset's
 * color key → palette hex. Legacy pre-006 bookings that stored a built-in KEY
 * still resolve through the static contract when no preset label matches.
 * No match (custom free-text, renamed/deleted preset, preset with color=null)
 * → undefined = the themed default look.
 */
export function eventTypeDefaultColor(
  eventType: string,
  presets?: EventTypePreset[] | null,
): BookingColorDef | undefined {
  return findBookingColor(presetColorKey(presets, eventType));
}

/**
 * Effective calendar color per the shared contract (event-types.json $comment):
 * explicit bookings.color → event-type default (from the business's presets) →
 * undefined (standard themed purple).
 */
export function effectiveBookingColor(
  booking: Pick<Booking, 'color' | 'event_type'>,
  presets?: EventTypePreset[] | null,
): BookingColorDef | undefined {
  return findBookingColor(booking.color) ?? eventTypeDefaultColor(booking.event_type, presets);
}

/**
 * How a calendar pill / spanning bar should be painted:
 * - tentative bookings keep their outlined-amber treatment regardless of color;
 * - otherwise the effective color (explicit bookings.color, else the type
 *   default from the business's presets) paints the pill with the palette hex
 *   + on-color;
 * - no effective color (custom free-text type, renamed/deleted preset, or an
 *   unknown key from a newer contract) falls back to the themed default
 *   (primary purple).
 */
export type PillPaint =
  | { kind: 'tentative' }
  | { kind: 'themed' }
  | { kind: 'custom'; bg: string; fg: string };

export function pillPaint(
  booking: Pick<Booking, 'status' | 'color' | 'event_type'>,
  presets?: EventTypePreset[] | null,
): PillPaint {
  if (booking.status === 'tentative') {
    return { kind: 'tentative' };
  }
  const def = effectiveBookingColor(booking, presets);
  return def ? { kind: 'custom', bg: def.hex, fg: def.on_hex } : { kind: 'themed' };
}
