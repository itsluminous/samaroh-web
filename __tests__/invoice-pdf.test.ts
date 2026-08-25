// pdf-lib renderer smoke tests: renders a valid PDF with the embedded
// Latin+Devanagari font in both locales (layout contract execution proof).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import hi from '../messages/hi.json';
import en from '../messages/en.json';
import { renderInvoicePdf } from '@/lib/invoice/pdf';
import type { InvoiceData, InvoiceLabels } from '@/lib/invoice/types';

const fonts = {
  regular: new Uint8Array(readFileSync(join(process.cwd(), 'public/fonts/Mukta-Regular.ttf'))),
  bold: new Uint8Array(readFileSync(join(process.cwd(), 'public/fonts/Mukta-Bold.ttf'))),
};

type Catalog = typeof en;

function labelsFrom(catalog: Catalog): InvoiceLabels {
  const inv = catalog.invoice;
  return {
    title: inv.title,
    numberLabel: inv.number_label,
    issueDateLabel: inv.issue_date_label,
    billedTo: inv.billed_to,
    eventLabel: inv.event_label,
    totalAmount: inv.total_amount,
    securityDeposit: inv.security_deposit,
    paymentHistory: inv.payment_history,
    tableDate: inv.table.date,
    tableMethod: inv.table.method,
    tableNotes: inv.table.notes,
    tableAmount: inv.table.amount,
    totalPaid: inv.total_paid,
    balanceDue: inv.balance_due,
    fullyPaid: inv.fully_paid,
    noPayments: inv.no_payments,
    footer: inv.footer,
  };
}

const data: InvoiceData = {
  businessName: 'Shree Ganesh Hall',
  businessType: 'Marriage Hall',
  address: 'Station Road, Gorakhpur',
  ownerName: 'Suresh Gupta',
  invoiceNumber: 'SGH-2026-0042',
  issueDate: '2026-07-15',
  customerName: 'Ramesh Kumar',
  customerPhone: '9876543210',
  eventIcon: '\u{1F492}',
  eventLabel: 'Wedding',
  startDate: '2026-07-10',
  endDate: '2026-07-12',
  startTime: '18:00',
  endTime: '23:00',
  totalAmount: 106511,
  securityDeposit: 5000,
  payments: [
    { paidOn: '2026-07-01', methodLabel: 'Cash', notes: 'advance', amount: 50000 },
    { paidOn: '2026-07-11', methodLabel: 'UPI', notes: null, amount: 6511 },
  ],
};

describe('renderInvoicePdf', () => {
  it('renders a valid A4 PDF in English', async () => {
    const bytes = await renderInvoicePdf(data, labelsFrom(en), 'en', fonts);
    expect(bytes.length).toBeGreaterThan(1000);
    // %PDF- magic header
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-');
  }, 30000);

  it('renders Devanagari labels in Hindi without throwing', async () => {
    const hiData: InvoiceData = {
      ...data,
      eventLabel: hi.booking.event_type.wedding,
      customerName: '\u0930\u092E\u0947\u0936 \u0915\u0941\u092E\u093E\u0930',
      payments: data.payments.map((p) => ({ ...p, methodLabel: hi.invoice.method.cash })),
    };
    const bytes = await renderInvoicePdf(hiData, labelsFrom(hi), 'hi', fonts);
    expect(bytes.length).toBeGreaterThan(1000);
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-');
  }, 30000);

  it('renders the empty-payments state (no payment rows)', async () => {
    const bytes = await renderInvoicePdf({ ...data, payments: [] }, labelsFrom(en), 'en', fonts);
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-');
  }, 30000);
});
