// Invoice number contract: {prefix}-{YYYY}-{counter:04d}.

import { formatInvoiceNumber } from '@/lib/invoice/number';

describe('formatInvoiceNumber', () => {
  it('zero-pads the counter to 4 digits', () => {
    expect(formatInvoiceNumber('SGH', 2026, 42)).toBe('SGH-2026-0042');
    expect(formatInvoiceNumber('INV', 2026, 1)).toBe('INV-2026-0001');
  });

  it('does not truncate counters past 9999', () => {
    expect(formatInvoiceNumber('INV', 2027, 12345)).toBe('INV-2027-12345');
  });
});
