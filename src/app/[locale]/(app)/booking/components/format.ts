'use client';

// Booking display helpers shared by the section's components.

import type { Translate } from '@/lib/invoice/client';
import { eventTypeLabel } from '@/lib/invoice/client';
import type { Booking } from '@/lib/booking/types';

/**
 * Canonical booking title (§4.1): "{icon} {EventType} - {Customer Name}" —
 * the same string is used as the Google Calendar event title.
 */
export function formatBookingTitle(booking: Booking, t: Translate): string {
  return `${booking.event_icon} ${eventTypeLabel(booking, t)} - ${booking.customer_name}`;
}

/** First name only, for the compact calendar pills. */
export function pillLabel(booking: Booking): string {
  const firstName = booking.customer_name.trim().split(/\s+/)[0] ?? booking.customer_name;
  return `${booking.event_icon} ${firstName}`;
}
