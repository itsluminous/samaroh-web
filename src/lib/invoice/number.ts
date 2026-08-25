// Invoice number contract (shared/invoice/layout-spec.md):
//   {prefix}-{YYYY}-{counter:04d}   e.g. SGH-2026-0042
// Assigned once per booking on first generation, then frozen.

export function formatInvoiceNumber(prefix: string, year: number, counter: number): string {
  return `${prefix}-${year}-${String(counter).padStart(4, '0')}`;
}
