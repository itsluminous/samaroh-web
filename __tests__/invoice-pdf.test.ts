// pdf-lib renderer smoke tests: renders a valid PDF with the embedded
// Latin+Devanagari font in both locales (layout contract execution proof).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, PDFPage, type PDFOperator } from 'pdf-lib';
import hi from '../messages/hi.json';
import en from '../messages/en.json';
import { renderInvoicePdf, roundedRectClip, stripEmoji, wrapText } from '@/lib/invoice/pdf';
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
    notesTitle: inv.notes_title,
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
  notes: null,
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

// 2026-10-12 layout change set (shared/docs/invoice-layout.md): no
// business-type line, logo top-left, Notes block from bookings.notes
// verbatim, display-form invoice number.
describe('invoice layout 2026-10-12 change set', () => {
  async function drawnRuns(d: InvoiceData): Promise<string[]> {
    const spy = jest.spyOn(PDFPage.prototype, 'drawText');
    try {
      await renderInvoicePdf(d, labelsFrom(en), 'en', fonts);
      return spy.mock.calls.map((c) => c[0] as string);
    } finally {
      spy.mockRestore();
    }
  }

  it('header prints name, address and owner — and NO business-type line', async () => {
    const drawn = await drawnRuns(data);
    expect(drawn).toContain('Shree Ganesh Hall');
    expect(drawn).toContain('Station Road, Gorakhpur');
    expect(drawn).toContain('Suresh Gupta');
    expect(drawn).not.toContain('Marriage Hall');
    // InvoiceData has no business-type field at all any more.
    expect('businessType' in data).toBe(false);
  }, 30000);

  it('skips blank header lines instead of printing them empty', async () => {
    const drawn = await drawnRuns({ ...data, address: '   ' });
    expect(drawn.filter((r) => r.trim() === '')).toHaveLength(0);
  }, 30000);

  it('prints no Notes block when bookings.notes is null or blank', async () => {
    // (The payment table's "Notes" COLUMN header is a different run, after Total amount.)
    for (const notes of [null, '  \n ']) {
      const drawn = await drawnRuns({ ...data, notes });
      const beforeAmounts = drawn.slice(0, drawn.indexOf(en.invoice.total_amount));
      expect(beforeAmounts).not.toContain(en.invoice.notes_title);
    }
  }, 30000);

  it('prints the Notes block after the event line: title + bookings.notes verbatim, newlines kept', async () => {
    const drawn = await drawnRuns({
      ...data,
      notes: '  Stage on the north side\nDJ till 11 pm \u{1F389}\nNo outside caterers  ',
    });
    const title = drawn.indexOf(en.invoice.notes_title);
    expect(title).toBeGreaterThan(drawn.indexOf('Event: Wedding'));
    expect(title).toBeLessThan(drawn.indexOf(en.invoice.total_amount));
    expect(drawn.slice(title + 1, title + 4)).toEqual([
      'Stage on the north side',
      'DJ till 11 pm', // emoji stripped like every other PDF run
      'No outside caterers',
    ]);
  }, 30000);

  it('wraps a long note to the content width without truncating a single word', async () => {
    const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    const drawn = await drawnRuns({ ...data, notes: long });
    const title = drawn.indexOf(en.invoice.notes_title);
    const until = drawn.indexOf(en.invoice.total_amount);
    const lines = drawn.slice(title + 1, until);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe(long);
    for (const line of lines) {
      expect(line.endsWith('\u2026')).toBe(false);
    }
  }, 30000);

  it('a very long note pushes later sections onto a second page instead of clipping', async () => {
    const long = Array.from({ length: 120 }, (_, i) => `line ${i} of the agreement`).join('\n');
    const bytes = await renderInvoicePdf({ ...data, notes: long }, labelsFrom(en), 'en', fonts);
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(2);
    // …and the one-page case stays one page.
    const short = await PDFDocument.load(await renderInvoicePdf(data, labelsFrom(en), 'en', fonts));
    expect(short.getPageCount()).toBe(1);
  }, 30000);

  it('wrapText keeps author line breaks (incl. blank lines) and hard-breaks over-long words', () => {
    const font = { widthOfTextAtSize: (t: string) => t.length * 10 } as unknown as import('pdf-lib').PDFFont;
    expect(wrapText(font, 'aa bb cc\n\ndd', 10, 55)).toEqual(['aa bb', 'cc', '', 'dd']);
    expect(wrapText(font, 'abcdefghij', 10, 45)).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('draws the logo top-left, flush with the margins, and starts the text 12pt right of it', async () => {
    const png = readFileSync(join(process.cwd(), 'public/icons/icon-192.png'));
    const imgSpy = jest.spyOn(PDFPage.prototype, 'drawImage');
    const textSpy = jest.spyOn(PDFPage.prototype, 'drawText');
    const opsSpy = jest.spyOn(PDFPage.prototype, 'pushOperators');
    try {
      await renderInvoicePdf({ ...data, logoPng: new Uint8Array(png) }, labelsFrom(en), 'en', fonts);
      expect(imgSpy).toHaveBeenCalledTimes(1);
      const opts = imgSpy.mock.calls[0]?.[1] as { x: number; y: number; width: number; height: number };
      expect(opts).toMatchObject({ x: 40, y: 842 - 40 - 56, width: 56, height: 56 });
      const name = textSpy.mock.calls.find((c) => c[0] === 'Shree Ganesh Hall');
      expect((name?.[1] as { x: number }).x).toBe(40 + 56 + 12);
      // Rounded 8 pt corners (layout-spec): the image is drawn inside a saved
      // graphics state whose clip is the 56×56 rounded rect at the logo's
      // position — the same tile Android's renderer clips to.
      const serialise = (ops: PDFOperator[]) => ops.map((o) => o.toString()).join('\n');
      const pushed = opsSpy.mock.calls.map((c) => serialise(c as PDFOperator[]));
      const expectedClip = serialise(roundedRectClip(40, 842 - 40 - 56, 56, 56, 8));
      const clipCall = pushed.findIndex((s) => s.startsWith('q\n') && s.endsWith(expectedClip));
      expect(clipCall).toBeGreaterThanOrEqual(0);
      expect(pushed[clipCall + 1]).toBe('Q');
      // The clip is in effect while the image is drawn (operator order: clip, image, restore).
      const order = [...imgSpy.mock.invocationCallOrder, ...opsSpy.mock.invocationCallOrder].sort((a, b) => a - b);
      const clipAt = opsSpy.mock.invocationCallOrder[clipCall] ?? -1;
      const restoreAt = opsSpy.mock.invocationCallOrder[clipCall + 1] ?? -1;
      const imageAt = imgSpy.mock.invocationCallOrder[0] ?? -1;
      expect(order.indexOf(clipAt)).toBeLessThan(order.indexOf(imageAt));
      expect(order.indexOf(imageAt)).toBeLessThan(order.indexOf(restoreAt));
    } finally {
      imgSpy.mockRestore();
      textSpy.mockRestore();
      opsSpy.mockRestore();
    }
  }, 30000);

  it('roundedRectClip traces a closed rounded rectangle and ends with a clip (W n)', () => {
    const ops = roundedRectClip(40, 746, 56, 56, 8).map((o) => o.toString());
    expect(ops[0]).toBe('48 746 m'); // starts after the first corner radius
    expect(ops.filter((o) => o.endsWith(' c'))).toHaveLength(4); // four quarter-circle corners
    expect(ops.slice(-3)).toEqual(['h', 'W', 'n']);
  });

  it('without a logo nothing is clipped and no image is drawn', async () => {
    const imgSpy = jest.spyOn(PDFPage.prototype, 'drawImage');
    const opsSpy = jest.spyOn(PDFPage.prototype, 'pushOperators');
    try {
      await renderInvoicePdf(data, labelsFrom(en), 'en', fonts);
      expect(imgSpy).not.toHaveBeenCalled();
      expect(opsSpy.mock.calls.some((c) => (c as PDFOperator[]).some((o) => o.toString() === 'W'))).toBe(false);
    } finally {
      imgSpy.mockRestore();
      opsSpy.mockRestore();
    }
  }, 30000);

  it('without a logo the header text starts at the margin (no placeholder gap)', async () => {
    const textSpy = jest.spyOn(PDFPage.prototype, 'drawText');
    try {
      await renderInvoicePdf(data, labelsFrom(en), 'en', fonts);
      const name = textSpy.mock.calls.find((c) => c[0] === 'Shree Ganesh Hall');
      expect((name?.[1] as { x: number }).x).toBe(40);
    } finally {
      textSpy.mockRestore();
    }
  }, 30000);
});
