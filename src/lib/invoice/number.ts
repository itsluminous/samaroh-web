// Invoice number contract (shared/invoice/layout-spec.md):
//   {prefix}-{YYYY}-{counter:04d}   e.g. SGH-2026-0042
// Assigned once per booking on first generation, then frozen.

export function formatInvoiceNumber(prefix: string, year: number, counter: number): string {
  return `${prefix}-${year}-${String(counter).padStart(4, '0')}`;
}

/**
 * Display form of a STORED invoice number (layout-spec "Display form",
 * 2026-10-12) — the one rule used everywhere the number is shown: PDF
 * header, text receipt, booking detail "Invoice no." line and the PDF file
 * name. A bare manual register number (`^[0-9]+$`, Android ADR-020) is
 * shown as `{prefix}-{n:04d}` (`88` → `INV-0088`, `0088` → `INV-0088`,
 * `12345` → `INV-12345`); anything else is shown verbatim. The stored value
 * NEVER changes (uniqueness checks and the paper-register mapping keep
 * working on the raw string).
 */
export function displayInvoiceNumber(stored: string, prefix: string): string {
  const trimmed = stored.trim();
  if (/^[0-9]+$/.test(trimmed)) {
    const n = Number.parseInt(trimmed, 10);
    return `${prefix}-${String(n).padStart(4, '0')}`;
  }
  return trimmed;
}

/**
 * PDF download name (layout-spec "File name"): the display form + `.pdf`,
 * with every character outside `[A-Za-z0-9._-]` replaced by `-` (manual
 * numbers are free text).
 */
export function invoiceFileName(stored: string, prefix: string): string {
  const safe = displayInvoiceNumber(stored, prefix).replace(/[^A-Za-z0-9._-]/g, '-');
  return `${safe}.pdf`;
}
