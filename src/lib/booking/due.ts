// due = total_amount − Σ(non-deleted payments). ALWAYS computed, never stored
// (shared/supabase/migrations/001_schema.sql). Sums in paise to avoid float drift.

import type { Booking, BookingPayment } from './types';

/** Sum of non-deleted payments, in decimal rupees. */
export function computePaid(payments: Pick<BookingPayment, 'amount' | 'deleted_at'>[]): number {
  const paise = payments
    .filter((p) => p.deleted_at === null)
    .reduce((sum, p) => sum + Math.round(p.amount * 100), 0);
  return paise / 100;
}

/** total − paid. Can be negative when overpaid; renderers clamp for display. */
export function computeDue(
  totalAmount: number,
  payments: Pick<BookingPayment, 'amount' | 'deleted_at'>[],
): number {
  return (Math.round(totalAmount * 100) - Math.round(computePaid(payments) * 100)) / 100;
}

export interface MonthMoneySummary {
  received: number;
  pending: number;
}

/**
 * "This month" header totals: received = Σ paid, pending = Σ clamped due,
 * over live (non-cancelled) bookings. Marker-kind bookings (event_types.kind
 * = 'marker' — Lagan/Tilak day indicators) are calendar-only and excluded via
 * `isMarker`: they carry no payment status (parity with Android).
 */
export function monthMoneySummary(
  bookings: Pick<Booking, 'id' | 'status' | 'total_amount' | 'event_type'>[],
  paymentsByBooking: Record<string, BookingPayment[]>,
  isMarker: (eventType: string) => boolean,
): MonthMoneySummary {
  let received = 0;
  let pending = 0;
  for (const b of bookings) {
    if (b.status === 'cancelled' || isMarker(b.event_type)) {
      continue;
    }
    const payments = paymentsByBooking[b.id] ?? [];
    received += computePaid(payments);
    pending += Math.max(computeDue(b.total_amount, payments), 0);
  }
  return { received, pending };
}
