// Shared amount formatting (§5 + shared/invoice/layout-spec.md):
// Indian digit grouping (₹1,06,51,161 — last 3 digits, then groups of 2),
// two decimals only when paise are non-zero, ₹ immediately before the number.
// One central implementation — never raw toLocaleString() elsewhere.

const RUPEE = '\u20B9';

/** Groups an unsigned integer string the Indian way: 1065116 → 10,65,116. */
function groupIndian(digits: string): string {
  if (digits.length <= 3) {
    return digits;
  }
  const last3 = digits.slice(-3);
  let head = digits.slice(0, -3);
  const parts: string[] = [];
  while (head.length > 2) {
    parts.unshift(head.slice(-2));
    head = head.slice(0, -2);
  }
  if (head.length > 0) {
    parts.unshift(head);
  }
  return `${parts.join(',')},${last3}`;
}

/**
 * Formats decimal rupees, e.g. 106511 → "₹1,06,511", 500.5 → "₹500.50",
 * 500.0 → "₹500". Negative input renders with a leading minus (invoices
 * clamp before calling — negative amounts never appear on invoices).
 */
export function formatRupees(amount: number): string {
  const negative = amount < 0;
  // Work in paise to dodge float noise (numeric(12,2) fits comfortably).
  const paise = Math.round(Math.abs(amount) * 100);
  const whole = Math.floor(paise / 100);
  const frac = paise % 100;
  let text = `${RUPEE}${groupIndian(String(whole))}`;
  if (frac > 0) {
    text += `.${String(frac).padStart(2, '0')}`;
  }
  return negative ? `-${text}` : text;
}

/** Parses a user-typed amount ("1,06,511.50" / "1500") into decimal rupees, or null. */
export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[,\s\u20B9]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return null;
  }
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}
