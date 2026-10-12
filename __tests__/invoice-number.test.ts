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

// Display form + file name (layout-spec 2026-10-12): one pure helper, same
// test table on both platforms. The STORED value never changes.
import { displayInvoiceNumber, invoiceFileName } from '@/lib/invoice/number';

describe('displayInvoiceNumber', () => {
  it.each([
    ['88', 'INV', 'INV-0088'],
    ['0088', 'INV', 'INV-0088'],
    ['12345', 'INV', 'INV-12345'],
    ['INV-2026-0042', 'INV', 'INV-2026-0042'],
    ['A-12', 'INV', 'A-12'],
    ['88', 'SGH', 'SGH-0088'],
  ])('%s + %s → %s', (stored, prefix, expected) => {
    expect(displayInvoiceNumber(stored, prefix)).toBe(expected);
  });

  it('tolerates surrounding whitespace on a manual number', () => {
    expect(displayInvoiceNumber(' 7 ', 'INV')).toBe('INV-0007');
  });
});

describe('invoiceFileName', () => {
  it('names the PDF after the display number, never the bare register digits', () => {
    expect(invoiceFileName('88', 'INV')).toBe('INV-0088.pdf');
    expect(invoiceFileName('SGH-2026-0042', 'SGH')).toBe('SGH-2026-0042.pdf');
  });

  it('replaces characters outside [A-Za-z0-9._-] with a dash', () => {
    expect(invoiceFileName('A/12 (old)', 'INV')).toBe('A-12--old-.pdf');
    expect(invoiceFileName('\u0936\u093E\u0926\u0940 1', 'INV')).toBe('-----1.pdf');
  });
});
