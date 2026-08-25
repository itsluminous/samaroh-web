/**
 * Rupee amount formatting with Indian digit grouping (₹1,06,51,161) — the
 * shared amount-formatting convention required by the spec (§5). Never use raw
 * `toLocaleString()` for money; import from here instead.
 */

export interface FormatAmountOptions {
  /** Prefix with the ₹ symbol (default true). */
  showSymbol?: boolean;
  /**
   * Fixed number of decimal places. When omitted, whole rupees render without
   * decimals and fractional amounts render with exactly 2 (decimal rupees).
   */
  decimals?: number;
}

/**
 * Groups an integer digit string per the Indian numbering system: first comma
 * after 3 digits from the right, then every 2 digits (12,34,56,789).
 */
function groupIndianDigits(integerDigits: string): string {
  if (integerDigits.length <= 3) {
    return integerDigits;
  }
  const last3 = integerDigits.slice(-3);
  let head = integerDigits.slice(0, -3);
  const groups: string[] = [];
  while (head.length > 2) {
    groups.unshift(head.slice(-2));
    head = head.slice(0, -2);
  }
  if (head.length > 0) {
    groups.unshift(head);
  }
  return `${groups.join(',')},${last3}`;
}

/** Formats a number with Indian digit grouping, without any currency symbol. */
export function formatIndianNumber(value: number, decimals?: number): string {
  if (!Number.isFinite(value)) {
    return decimals !== undefined && decimals > 0 ? `0.${'0'.repeat(decimals)}` : '0';
  }
  const effectiveDecimals = decimals ?? (Number.isInteger(round2(value)) ? 0 : 2);
  const fixed = Math.abs(value).toFixed(effectiveDecimals);
  const dotIndex = fixed.indexOf('.');
  const intPart = dotIndex === -1 ? fixed : fixed.slice(0, dotIndex);
  const fracPart = dotIndex === -1 ? '' : fixed.slice(dotIndex + 1);
  const grouped = groupIndianDigits(intPart);
  const sign = value < 0 && Number(fixed) !== 0 ? '-' : '';
  return fracPart ? `${sign}${grouped}.${fracPart}` : `${sign}${grouped}`;
}

/** Formats a rupee amount, e.g. `formatAmount(10651161)` → `₹1,06,51,161`. */
export function formatAmount(value: number, options: FormatAmountOptions = {}): string {
  const { showSymbol = true, decimals } = options;
  const formatted = formatIndianNumber(value, decimals);
  return showSymbol ? `₹${formatted}` : formatted;
}

export interface ParseAmountOptions {
  /**
   * Accept 0 as a valid amount (default false). Ledger entries are always
   * positive (direction carries the sign), but booking totals/deposits/advance
   * legitimately default to ₹0.
   */
  allowZero?: boolean;
}

/**
 * Parses user amount input (tolerates ₹, commas, whitespace) into a
 * non-negative decimal-rupee number rounded to 2 places. Returns null when
 * invalid, negative, or — unless `allowZero` — zero.
 */
export function parseAmount(input: string, options: ParseAmountOptions = {}): number | null {
  if (typeof input !== 'string') {
    return null;
  }
  const clean = input.replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) {
    return null;
  }
  const value = Number.parseFloat(clean);
  if (!Number.isFinite(value) || value < 0 || (value === 0 && !options.allowZero)) {
    return null;
  }
  return round2(value);
}

/** Rounds to 2 decimal places (currency precision), normalising -0 to 0. */
export function round2(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}
