/**
 * Tentative-booking display icon (ADR-020 #3 parity, presentation-only):
 * tentative bookings render 👤 everywhere a booking icon shows (calendar
 * pills, agenda rows, card/detail titles) REGARDLESS of event type;
 * confirming reverts to the stored `event_icon`, which is never rewritten.
 * Scope mirror of Android's `Booking.displayIcon`: invoice PDFs/receipts and
 * WhatsApp messages keep the stored icon (they are documents, not calendar
 * presentation).
 */
import type { Booking } from '@/lib/booking/types';

/** The tentative-booking glyph (👤). */
export const TENTATIVE_ICON = '\u{1F464}';

export function displayIcon(booking: Pick<Booking, 'status' | 'event_icon'>): string {
  return booking.status === 'tentative' ? TENTATIVE_ICON : booking.event_icon;
}
