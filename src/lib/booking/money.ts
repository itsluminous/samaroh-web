// Booking-facing money helpers — a thin façade over the single shared
// Indian-grouping formatter in `@/lib/format/amount` (§5 +
// shared/invoice/layout-spec.md). One central implementation — never raw
// toLocaleString() elsewhere.

import { formatAmount, parseAmount as parseAmountCore } from '@/lib/format/amount';

/**
 * Formats decimal rupees, e.g. 106511 → "₹1,06,511", 500.5 → "₹500.50",
 * 500.0 → "₹500". Negative input renders with a leading minus (invoices
 * clamp before calling — negative amounts never appear on invoices).
 */
export function formatRupees(amount: number): string {
  if (amount < 0) {
    return `-${formatAmount(Math.abs(amount))}`;
  }
  return formatAmount(amount);
}

/**
 * Parses a user-typed amount ("1,06,511.50" / "1500") into decimal rupees,
 * or null. Unlike the ledger parser, ₹0 is valid here — booking totals,
 * deposits and advances default to zero.
 */
export function parseAmount(input: string): number | null {
  return parseAmountCore(input, { allowZero: true });
}
