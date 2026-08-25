// Indian digit grouping + paise rules (shared/invoice/layout-spec.md).

import { formatRupees, parseAmount } from '@/lib/booking/money';

describe('formatRupees', () => {
  it('groups the last 3 digits then groups of 2 (₹1,06,511)', () => {
    expect(formatRupees(106511)).toBe('\u20B91,06,511');
  });

  it('handles crore-scale amounts (₹1,06,51,161)', () => {
    expect(formatRupees(10651161)).toBe('\u20B91,06,51,161');
  });

  it('leaves small amounts ungrouped and drops zero paise', () => {
    expect(formatRupees(500)).toBe('\u20B9500');
    expect(formatRupees(500.0)).toBe('\u20B9500');
  });

  it('keeps two decimals only when paise are non-zero', () => {
    expect(formatRupees(500.5)).toBe('\u20B9500.50');
    expect(formatRupees(1234.05)).toBe('\u20B91,234.05');
  });

  it('formats zero as ₹0', () => {
    expect(formatRupees(0)).toBe('\u20B90');
  });
});

describe('parseAmount', () => {
  it('accepts plain and Indian-grouped input', () => {
    expect(parseAmount('1500')).toBe(1500);
    expect(parseAmount('1,06,511.50')).toBe(106511.5);
  });

  it('rejects junk', () => {
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('12.345')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
  });
});
