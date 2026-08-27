/**
 * Tiny CSV builder + browser download helper for report exports (§4.4 —
 * "exportable as CSV"; the web counterpart of the Android share action).
 * RFC-4180-style quoting; a UTF-8 BOM keeps ₹ and Devanagari intact when the
 * file is opened in spreadsheet apps.
 */

export type CsvCell = string | number | null | undefined;

function escapeCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) {
    return '';
  }
  const text = String(cell);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(headers: CsvCell[], rows: CsvCell[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/**
 * Machine-readable money for CSV cells: plain decimal rupees with exactly two
 * decimals — no ₹ symbol, no digit grouping (a comma would need quoting and
 * confuse numeric parsing in spreadsheet imports).
 */
export function csvAmount(value: number): string {
  if (!Number.isFinite(value)) {
    return '0.00';
  }
  const fixed = value.toFixed(2);
  return fixed === '-0.00' ? '0.00' : fixed;
}

export interface CsvSection {
  /** Optional single-cell title line above the section's header row. */
  title?: string;
  headers: CsvCell[];
  rows: CsvCell[][];
}

/**
 * Multi-table CSV: sections separated by a blank line, each optionally
 * preceded by a title line (used by reports that export more than one table,
 * e.g. personal expenses by month + by party).
 */
export function toCsvSections(sections: CsvSection[]): string {
  const blocks = sections.map((section) => {
    const lines = [...(section.title ? [[section.title]] : []), section.headers, ...section.rows];
    return lines.map((row) => row.map(escapeCell).join(',')).join('\r\n');
  });
  return `\uFEFF${blocks.join('\r\n\r\n')}\r\n`;
}

/** Triggers a client-side download of the CSV (no server round-trip). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
