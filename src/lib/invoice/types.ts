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
  businessType: string;
  address: string | null;
  ownerName: string;
  /** PNG bytes for the header logo; omitted → text-only header. */
  logoPng?: Uint8Array;
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
