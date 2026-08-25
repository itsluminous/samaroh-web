// due = total_amount − Σ(non-deleted payments). ALWAYS computed, never stored
// (shared/supabase/migrations/001_schema.sql). Sums in paise to avoid float drift.

import type { BookingPayment } from './types';

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
