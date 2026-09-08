'use client';

// Booking display helpers shared by the section's components.

import type { Translate } from '@/lib/invoice/client';
import { eventTypeLabel } from '@/lib/invoice/client';
import { displayIcon } from '@/lib/booking/displayIcon';
import type { Booking } from '@/lib/booking/types';

/**
 * Canonical booking title (§4.1): "{icon} {EventType} - {Customer Name}" —
 * the same string is used as the Google Calendar event title. The icon is
 * the DISPLAY icon: 👤 while tentative (ADR-020 #3), the stored event icon
 * otherwise.
 */
export function formatBookingTitle(booking: Booking, t: Translate): string {
  return `${displayIcon(booking)} ${eventTypeLabel(booking, t)} - ${booking.customer_name}`;
}

/** First name only, for the compact calendar pills (👤 while tentative). */
export function pillLabel(booking: Booking): string {
  const firstName = booking.customer_name.trim().split(/\s+/)[0] ?? booking.customer_name;
  return `${displayIcon(booking)} ${firstName}`;
}
