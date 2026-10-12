// Renderer-agnostic invoice data + resolved label bundle. Both the pdf-lib
// renderer and the text receipt consume these; labels are resolved from the
// invoice.* catalog keys by the caller (zero hardcoded text in renderers).

export interface InvoicePaymentLine {
  paidOn: string; // ISO date
  methodLabel: string; // localized label, never the enum literal
  notes: string | null;
  amount: number; // decimal rupees
}

export interface InvoiceData {
  businessName: string;
  // No businessType: the header's business-type line was REMOVED from the
  // layout contract on 2026-10-12 (it told the customer nothing).
  address: string | null;
  ownerName: string;
  /** PNG bytes for the header logo; omitted → text-only header. */
  logoPng?: Uint8Array;
  /** DISPLAY form of the stored number (displayInvoiceNumber) — never the raw manual digits. */
  invoiceNumber: string;
  issueDate: string; // ISO date
  customerName: string;
  customerPhone: string | null;
  eventIcon: string; // emoji (renders as-is in text; skipped in PDF glyph runs)
  eventLabel: string; // localized event-type label
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  /**
   * `bookings.notes` verbatim (the booking's OWN notes — never
   * booking_payments.notes). Blank/null → the Notes block is not printed.
   */
  notes: string | null;
  totalAmount: number;
  securityDeposit: number;
  payments: InvoicePaymentLine[];
}

export interface InvoiceLabels {
  title: string;
  numberLabel: string;
  issueDateLabel: string;
  billedTo: string;
  eventLabel: string;
  /** Title of the Notes block (layout-spec §3a). */
  notesTitle: string;
  totalAmount: string;
  securityDeposit: string;
  paymentHistory: string;
  tableDate: string;
  tableMethod: string;
  tableNotes: string;
  tableAmount: string;
  totalPaid: string;
  balanceDue: string;
  fullyPaid: string;
  noPayments: string;
  footer: string;
}
