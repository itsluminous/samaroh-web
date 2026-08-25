import { formatAmount, formatIndianNumber, parseAmount, round2 } from '@/lib/format/amount';

describe('formatIndianNumber', () => {
  it('groups with Indian comma placement (first 3, then 2s)', () => {
    expect(formatIndianNumber(10651161)).toBe('1,06,51,161');
    expect(formatIndianNumber(106511)).toBe('1,06,511');
    expect(formatIndianNumber(1000)).toBe('1,000');
  });

  it('leaves 3-digit-or-shorter integers ungrouped', () => {
    expect(formatIndianNumber(0)).toBe('0');
    expect(formatIndianNumber(999)).toBe('999');
  });

  it('keeps 2 decimals for fractional amounts (decimal rupees)', () => {
    expect(formatIndianNumber(1234.5)).toBe('1,234.50');
    expect(formatIndianNumber(150000.75)).toBe('1,50,000.75');
  });

  it('honours an explicit decimals option', () => {
    expect(formatIndianNumber(500, 2)).toBe('500.00');
  });

  it('formats negative amounts with a single leading sign', () => {
    expect(formatIndianNumber(-106511.25)).toBe('-1,06,511.25');
  });
});

describe('formatAmount', () => {
  it('prefixes the rupee symbol by default', () => {
    expect(formatAmount(10651161)).toBe('₹1,06,51,161');
  });

  it('omits the symbol when showSymbol is false', () => {
    expect(formatAmount(1500, { showSymbol: false })).toBe('1,500');
  });
});

describe('parseAmount', () => {
  it('parses plain and formatted input', () => {
    expect(parseAmount('500')).toBe(500);
    expect(parseAmount('₹1,06,511.25')).toBe(106511.25);
  });

  it('rejects invalid, zero and negative input', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
    expect(parseAmount('1.234')).toBeNull();
  });
});

describe('round2', () => {
  it('rounds to currency precision and normalises -0', () => {
    expect(round2(10.005)).toBe(10.01);
    expect(round2(-0)).toBe(0);
  });
});
