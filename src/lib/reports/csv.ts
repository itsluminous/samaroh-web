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
