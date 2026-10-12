// pdf-lib invoice renderer implementing shared/invoice/layout-spec.md.
// A4 portrait, 40 pt margins, Mukta (Latin + Devanagari + ₹) embedded via
// fontkit so the PDF renders in the app's current language. All labels come
// in pre-resolved from the invoice.* catalog keys — zero hardcoded text.

// fontkit's OpenType shaping (Devanagari syllable state machine) is compiled
// to generator code that needs the regenerator runtime in both jsdom and the
// browser bundle — import it before fontkit is used.
import 'regenerator-runtime/runtime';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFFont, PDFPage, rgb, type RGB } from 'pdf-lib';
import { formatDate, formatDateRange, formatTime } from '@/lib/booking/dates';
import { formatRupees } from '@/lib/booking/money';
import type { InvoiceData, InvoiceLabels } from './types';

// Page geometry (layout-spec: Page).
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 40;
const RIGHT = PAGE_W - MARGIN;

// Palette (layout-spec + shared/brand/palette.md).
const ACCENT = rgb(0x67 / 255, 0x50 / 255, 0xa4 / 255); // #6750A4
const BODY = rgb(0x1c / 255, 0x1b / 255, 0x1f / 255); // #1C1B1F
const GREY = rgb(0x49 / 255, 0x45 / 255, 0x4f / 255); // #49454F
const BAND = rgb(0xea / 255, 0xdd / 255, 0xff / 255); // #EADDFF
const DUE_RED = rgb(0xb3 / 255, 0x26 / 255, 0x1e / 255); // #B3261E
const PAID_GREEN = rgb(0x14 / 255, 0x6c / 255, 0x2e / 255); // #146C2E

export interface InvoiceFonts {
  regular: Uint8Array | ArrayBuffer;
  bold: Uint8Array | ArrayBuffer;
}

/**
 * PDF invoices carry NO emoji/pictographs anywhere (owner decision, see
 * shared/invoice/layout-spec.md) — and the embedded text face has no
 * color-emoji glyphs anyway. Every PDF text run passes through this filter
 * (drawText + footer); the emoji still appears in the text receipt variant.
 * Exported for the emoji-free contract test.
 */
export function stripEmoji(text: string): string {
  // Extended_Pictographic alone misses emoji components that ride along in
  // sequences: skin tones (Emoji_Modifier), flags (Regional_Indicator pairs),
  // tag characters (subdivision flags), VS-16, ZWJ and the keycap combiner.
  // NOT \p{Emoji_Component} wholesale — that would also delete digits 0-9.
  return text
    .replace(
      /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu,
      '',
    )
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function roundedRectPath(w: number, h: number, r: number): string {
  // SVG path, y grows downward from the anchor point.
  return [
    `M ${r},0`,
    `L ${w - r},0`,
    `Q ${w},0 ${w},${r}`,
    `L ${w},${h - r}`,
    `Q ${w},${h} ${w - r},${h}`,
    `L ${r},${h}`,
    `Q 0,${h} 0,${h - r}`,
    `L 0,${r}`,
    `Q 0,0 ${r},0`,
    'Z',
  ].join(' ');
}

interface Ctx {
  doc: PDFDocument;
  page: PDFPage;
  regular: PDFFont;
  bold: PDFFont;
  y: number; // distance from the TOP of the page
}

/**
 * Greedy word wrap at `maxWidth` for `font`/`size`, preserving the author's
 * own line breaks (`\n`). Words wider than the line are hard-broken by
 * character so nothing ever overflows the content width. Operates on the
 * emoji-stripped text — that is what drawText actually draws. Exported for
 * the Notes-block contract tests.
 */
export function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  // Split on the author's line breaks FIRST — stripEmoji collapses runs of
  // whitespace (incl. newlines), so it runs per paragraph.
  for (const rawParagraph of text.split(/\r?\n/)) {
    const words = stripEmoji(rawParagraph).split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push('');
      continue;
    }
    let line = '';
    const push = (word: string) => {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        return;
      }
      if (line) {
        out.push(line);
        line = '';
      }
      // Single word wider than the line: break it by character.
      let chunk = '';
      for (const ch of word) {
        if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth && chunk) {
          out.push(chunk);
          chunk = '';
        }
        chunk += ch;
      }
      line = chunk;
    };
    words.forEach(push);
    out.push(line);
  }
  return out;
}

/**
 * Page-overflow guard: when the next `needed` points would cross the bottom
 * margin, continues on a fresh A4 page (layout-spec §3a: a long note may push
 * later sections onto page 2). The Y cursor restarts at the top margin.
 */
function ensureSpace(ctx: Ctx, needed: number): void {
  if (ctx.y + needed > PAGE_H - MARGIN) {
    ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
    ctx.y = MARGIN;
  }
}

function drawRule(ctx: Ctx, y: number): void {
  ctx.page.drawLine({
    start: { x: MARGIN, y: PAGE_H - y },
    end: { x: RIGHT, y: PAGE_H - y },
    thickness: 1,
    color: ACCENT,
  });
}

function drawText(
  ctx: Ctx,
  text: string,
  opts: { x: number; size: number; bold?: boolean; color?: RGB; rightAlignAt?: number },
): void {
  const font = opts.bold ? ctx.bold : ctx.regular;
  const safe = stripEmoji(text);
  const x =
    opts.rightAlignAt !== undefined
      ? opts.rightAlignAt - font.widthOfTextAtSize(safe, opts.size)
      : opts.x;
  ctx.page.drawText(safe, {
    x,
    y: PAGE_H - ctx.y - opts.size,
    size: opts.size,
    font,
    color: opts.color ?? BODY,
  });
}

export async function renderInvoicePdf(
  data: InvoiceData,
  labels: InvoiceLabels,
  locale: string,
  fonts: InvoiceFonts,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(fonts.regular, { subset: true });
  const bold = await doc.embedFont(fonts.bold, { subset: true });
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const ctx: Ctx = { doc, page, regular, bold, y: MARGIN };

  // ---- 1. Header band -------------------------------------------------
  // Logo top-LEFT (56×56, flush with the left + top margins) only when the
  // business has one; the text column starts 12 pt to its right. No logo →
  // text at the margin, no placeholder gap (layout-spec § Header band).
  let textX = MARGIN;
  if (data.logoPng) {
    const logo = await doc.embedPng(data.logoPng);
    page.drawImage(logo, { x: MARGIN, y: PAGE_H - MARGIN - 56, width: 56, height: 56 });
    textX = MARGIN + 56 + 12;
  }
  drawText(ctx, data.businessName, { x: textX, size: 20, bold: true });
  let leftY = ctx.y + 26;
  // Address + owner name ONLY — the business-type line was removed from the
  // contract (2026-10-12). Blank lines are skipped, never printed empty.
  for (const line of [data.address, data.ownerName]) {
    if (line && line.trim()) {
      drawText({ ...ctx, y: leftY }, line, { x: textX, size: 11, color: GREY });
      leftY += 15;
    }
  }
  // Right-aligned column: title, number, date.
  drawText(ctx, labels.title, { x: 0, size: 13, bold: true, color: ACCENT, rightAlignAt: RIGHT });
  drawText({ ...ctx, y: ctx.y + 19 }, data.invoiceNumber, { x: 0, size: 11, rightAlignAt: RIGHT });
  drawText({ ...ctx, y: ctx.y + 34 }, formatDate(data.issueDate, locale), {
    x: 0,
    size: 11,
    color: GREY,
    rightAlignAt: RIGHT,
  });
  const bandBottom = Math.max(leftY, ctx.y + 49, data.logoPng ? MARGIN + 56 : 0) + 8;
  drawRule(ctx, bandBottom);
  ctx.y = bandBottom + 16;

  // ---- 2. Customer block ----------------------------------------------
  drawText(ctx, labels.billedTo, { x: MARGIN, size: 11, bold: true });
  ctx.y += 16;
  drawText(ctx, data.customerName, { x: MARGIN, size: 11 });
  ctx.y += 15;
  if (data.customerPhone) {
    drawText(ctx, data.customerPhone, { x: MARGIN, size: 11, color: GREY });
    ctx.y += 15;
  }
  ctx.y += 10;

  // ---- 3. Event block ---------------------------------------------------
  drawText(ctx, `${labels.eventLabel}: ${data.eventLabel}`, { x: MARGIN, size: 11, bold: true });
  ctx.y += 16;
  const times = [formatTime(data.startTime, locale), formatTime(data.endTime, locale)]
    .filter(Boolean)
    .join(' \u2013 ');
  const when = formatDateRange(data.startDate, data.endDate, locale) + (times ? `, ${times}` : '');
  drawText(ctx, when, { x: MARGIN, size: 11 });
  ctx.y += 25;

  // ---- 3a. Notes block ----------------------------------------------------
  // Only when bookings.notes is non-blank: the booking's OWN notes verbatim
  // (trimmed, line breaks kept, wrapped to the content width, never
  // truncated). NOT booking_payments.notes — those stay in the table below.
  const notes = data.notes?.trim() ?? '';
  if (notes) {
    ensureSpace(ctx, 22 + 15);
    drawText(ctx, labels.notesTitle, { x: MARGIN, size: 13, bold: true, color: ACCENT });
    ctx.y += 22;
    for (const line of wrapText(ctx.regular, notes, 11, RIGHT - MARGIN)) {
      ensureSpace(ctx, 15);
      if (line) {
        drawText(ctx, line, { x: MARGIN, size: 11 });
      }
      ctx.y += 15;
    }
    ctx.y += 10;
  }

  // ---- 4. Amounts block -------------------------------------------------
  ensureSpace(ctx, 16 + 16 + 10);
  drawText(ctx, labels.totalAmount, { x: MARGIN, size: 11 });
  drawText(ctx, formatRupees(data.totalAmount), { x: 0, size: 11, rightAlignAt: RIGHT });
  ctx.y += 16;
  if (data.securityDeposit > 0) {
    drawText(ctx, labels.securityDeposit, { x: MARGIN, size: 11 });
    drawText(ctx, formatRupees(data.securityDeposit), { x: 0, size: 11, rightAlignAt: RIGHT });
    ctx.y += 16;
  }
  ctx.y += 10;

  // ---- 5. Payment history table ------------------------------------------
  ensureSpace(ctx, 22 + 15 + 6 + 16);
  drawText(ctx, labels.paymentHistory, { x: MARGIN, size: 13, bold: true });
  ctx.y += 22;
  const colMethodX = 170;
  const colNotesX = 290;
  drawText(ctx, labels.tableDate, { x: MARGIN, size: 11, bold: true });
  drawText(ctx, labels.tableMethod, { x: colMethodX, size: 11, bold: true });
  drawText(ctx, labels.tableNotes, { x: colNotesX, size: 11, bold: true });
  drawText(ctx, labels.tableAmount, { x: 0, size: 11, bold: true, rightAlignAt: RIGHT });
  ctx.y += 15;
  drawRule(ctx, ctx.y);
  ctx.y += 6;

  let paidPaise = 0;
  if (data.payments.length === 0) {
    drawText(ctx, labels.noPayments, { x: MARGIN, size: 11, color: GREY });
    ctx.y += 16;
  }
  for (const p of data.payments) {
    paidPaise += Math.round(p.amount * 100);
    ensureSpace(ctx, 16);
    drawText(ctx, formatDate(p.paidOn, locale), { x: MARGIN, size: 11 });
    drawText(ctx, p.methodLabel, { x: colMethodX, size: 11 });
    if (p.notes) {
      // Single-line clamp so the notes column never collides with the amount.
      // Measure the emoji-stripped text — it is what drawText actually draws.
      const full = stripEmoji(p.notes);
      let notes = full;
      while (ctx.regular.widthOfTextAtSize(notes, 11) > RIGHT - 90 - colNotesX && notes.length > 1) {
        notes = notes.slice(0, -1);
      }
      drawText(ctx, notes === full ? notes : `${notes}\u2026`, {
        x: colNotesX,
        size: 11,
        color: GREY,
      });
    }
    drawText(ctx, formatRupees(p.amount), { x: 0, size: 11, rightAlignAt: RIGHT });
    ctx.y += 16;
  }
  ctx.y += 4;
  ensureSpace(ctx, 16 + 26);
  drawText(ctx, labels.totalPaid, { x: MARGIN, size: 11, bold: true });
  drawText(ctx, formatRupees(paidPaise / 100), { x: 0, size: 11, bold: true, rightAlignAt: RIGHT });
  ctx.y += 26;

  // ---- 6. Balance due band ----------------------------------------------
  const duePaise = Math.round(data.totalAmount * 100) - paidPaise;
  const bandH = 32;
  ensureSpace(ctx, bandH + 16);
  ctx.page.drawSvgPath(roundedRectPath(RIGHT - MARGIN, bandH, 8), {
    x: MARGIN,
    y: PAGE_H - ctx.y,
    color: BAND,
  });
  const bandTextY = ctx.y + (bandH - 13) / 2;
  drawText({ ...ctx, y: bandTextY }, labels.balanceDue, {
    x: MARGIN + 12,
    size: 13,
    bold: true,
  });
  if (duePaise > 0) {
    drawText({ ...ctx, y: bandTextY }, formatRupees(duePaise / 100), {
      x: 0,
      size: 13,
      bold: true,
      color: DUE_RED,
      rightAlignAt: RIGHT - 12,
    });
  } else {
    // Never show a negative amount on an invoice (overpayment clamps to 0).
    drawText({ ...ctx, y: bandTextY }, `${labels.fullyPaid} \u00B7 ${formatRupees(0)}`, {
      x: 0,
      size: 13,
      bold: true,
      color: PAID_GREEN,
      rightAlignAt: RIGHT - 12,
    });
  }

  // ---- 7. Footer ----------------------------------------------------------
  const footer = `${labels.footer} \u00B7 ${formatDate(data.issueDate, locale)}`;
  const footerW = ctx.regular.widthOfTextAtSize(stripEmoji(footer), 9);
  ctx.page.drawText(stripEmoji(footer), {
    x: (PAGE_W - footerW) / 2,
    y: MARGIN - 9,
    size: 9,
    font: ctx.regular,
    color: GREY,
  });

  return doc.save();
}
