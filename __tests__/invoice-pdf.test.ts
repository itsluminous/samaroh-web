// pdf-lib renderer smoke tests: renders a valid PDF with the embedded
// Latin+Devanagari font in both locales (layout contract execution proof).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFPage } from 'pdf-lib';
import hi from '../messages/hi.json';
import en from '../messages/en.json';
import { renderInvoicePdf, stripEmoji } from '@/lib/invoice/pdf';
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

// PDF invoices carry NO emoji anywhere (owner decision — layout-spec). The
// proof: capture every text run handed to pdf-lib and assert none contains a
// pictograph, even when every input field is emoji-laden.
const EMOJI = /\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|[\u{FE0F}\u{200D}\u{20E3}]/u;

describe('emoji-free PDF contract', () => {
  it('no drawn text run contains a pictograph, incl. title and event line', async () => {
    const spy = jest.spyOn(PDFPage.prototype, 'drawText');
    try {
      const emojiData: InvoiceData = {
        ...data,
        businessName: '\u{1F3DB}\u{FE0F} Shree Ganesh Hall',
        eventIcon: '\u{1F492}',
        eventLabel: '\u{1F492} Wedding \u{1F389}',
        customerName: 'Ramesh Kumar \u{1F64F}\u{1F3FD}',
        payments: [
          { paidOn: '2026-07-01', methodLabel: 'Cash \u{1F4B5}', notes: 'advance \u{1F38A}', amount: 50000 },
        ],
      };
      const emojiLabels: InvoiceLabels = {
        ...labelsFrom(en),
        title: '\u{1F9FE} Invoice',
        eventLabel: '\u{1F3AA} Event',
      };
      const bytes = await renderInvoicePdf(emojiData, emojiLabels, 'en', fonts);
      expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-');

      const drawn = spy.mock.calls.map((c) => c[0] as string);
      expect(drawn.length).toBeGreaterThan(10);
      for (const run of drawn) {
        expect(run).not.toMatch(EMOJI);
      }
      // The event line is drawn stripped on both sides of the colon — and the
      // eventIcon field is never drawn at all.
      expect(drawn).toContain('Event: Wedding');
      expect(drawn.some((run) => run.includes('\u{1F492}'))).toBe(false);
      // Title made it through, emoji-free.
      expect(drawn).toContain('Invoice');
    } finally {
      spy.mockRestore();
    }
  }, 30000);

  it('stripEmoji removes composed sequences but keeps digits, ₹ and Devanagari', () => {
    expect(stripEmoji('\u{1F492} Wedding \u{1F389}')).toBe('Wedding');
    expect(stripEmoji('\u{1F44D}\u{1F3FD} ok')).toBe('ok'); // skin tone modifier
    expect(stripEmoji('\u{1F1EE}\u{1F1F3} India')).toBe('India'); // flag
    expect(stripEmoji('1\u{FE0F}\u{20E3} first')).toBe('1 first'); // keycap keeps digit
    expect(stripEmoji('\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}')).toBe(''); // ZWJ family
    expect(stripEmoji('\u0936\u093E\u0926\u0940 \u{1F549}\u{FE0F}')).toBe('\u0936\u093E\u0926\u0940');
    expect(stripEmoji('\u20B91,06,51,161 due 10 Jul 2026')).toBe('\u20B91,06,51,161 due 10 Jul 2026');
  });
});
