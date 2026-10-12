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

/** Palette severity index (shared/docs/calendar-day-color.md rule 4): booking-colors.json order is contractual. */
export function paletteIndex(key: string): number {
  const idx = BOOKING_COLORS.findIndex((c) => c.key === key);
  // Unknown keys (newer contract) rank after every known colour but before null.
  return idx === -1 ? BOOKING_COLORS.length : idx;
}

/**
 * ONE colour for a calendar day (shared/docs/calendar-day-color.md — the
 * rule both platforms share; Android's `CalendarMonthMapper` uses it for
 * the cell fill, web keeps per-booking pills and uses it for any aggregated
 * per-day indicator):
 *
 *   firm    = covering bookings that are not tentative (cancelled/tombstoned
 *             rows and markers that lost the ADR-041 rule must already be
 *             filtered out by the caller — `visibleCalendarBookings`)
 *   colours = firm.map(effectiveColourKey)              // key | null
 *   firm.isEmpty            → null  (no fill; tentative-only days keep the
 *                                   amber outline, which is not a fill)
 *   colours.allEqual        → colours[0]  (two reds → red; all null →
 *                                         undefined = themed default)
 *   else                    → the non-null key with the lowest palette index
 *
 * Never blends, never a "multiple" colour; status does not rank among firm
 * bookings. Returns the colour DEF (hex + on_hex) so the caller paints the
 * fill and the date number's on-colour together: `null` = no fill,
 * `undefined` = themed default fill.
 */
export function dayFillColor(
  covering: readonly Pick<Booking, 'status' | 'color' | 'event_type'>[],
  presets?: EventTypePreset[] | null,
): BookingColorDef | null | undefined {
  const firm = covering.filter((b) => b.status !== 'tentative');
  if (firm.length === 0) {
    return null;
  }
  const colours = firm.map((b) => effectiveBookingColor(b, presets)?.key ?? null);
  const first = colours[0] ?? null;
  if (colours.every((c) => c === first)) {
    return first === null ? undefined : findBookingColor(first);
  }
  let winner: string | null = null;
  for (const key of colours) {
    if (key !== null && (winner === null || paletteIndex(key) < paletteIndex(winner))) {
      winner = key;
    }
  }
  // Mixed ⇒ at least one non-null key exists.
  return winner === null ? undefined : findBookingColor(winner);
}
