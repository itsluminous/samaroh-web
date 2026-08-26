import { toCsv } from '@/lib/reports/csv';

describe('toCsv', () => {
  it('joins headers and rows with CRLF and a UTF-8 BOM', () => {
    const csv = toCsv(['Month', 'Total'], [['Jan 26', 1200]]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Month,Total\r\nJan 26,1200\r\n');
  });

  it('quotes cells containing commas, quotes and newlines', () => {
    const csv = toCsv(['a'], [['₹1,00,000'], ['say "hi"'], ['two\nlines'], [null], [undefined]]);
    expect(csv).toContain('"₹1,00,000"');
    expect(csv).toContain('"say ""hi"""');
    expect(csv).toContain('"two\nlines"');
    // Nullish cells become empty fields, not the string "null".
    expect(csv).not.toContain('null');
  });
});
