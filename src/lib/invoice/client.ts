'use client';

// Client glue for invoice generation: resolves invoice.* labels via next-intl,
// builds InvoiceData from a booking, fetches the embedded fonts, and drives
// the browser download / clipboard copy.

import type { SupabaseClient } from '@supabase/supabase-js';
import { todayIso } from '@/lib/booking/calendar';
import { findEventType, isBuiltInEventType } from '@/lib/booking/eventTypes';
import type { Booking, BookingPayment, Business } from '@/lib/booking/types';
import type { InvoiceData, InvoiceLabels } from '@/lib/invoice/types';

/** next-intl translator shape we need (t(key) and t(key, values)). */
export type Translate = (key: string, values?: Record<string, string | number | Date>) => string;

export function resolveInvoiceLabels(t: Translate): InvoiceLabels {
  return {
    title: t('invoice.title'),
    numberLabel: t('invoice.number_label'),
    issueDateLabel: t('invoice.issue_date_label'),
    billedTo: t('invoice.billed_to'),
    eventLabel: t('invoice.event_label'),
    totalAmount: t('invoice.total_amount'),
    securityDeposit: t('invoice.security_deposit'),
    paymentHistory: t('invoice.payment_history'),
    tableDate: t('invoice.table.date'),
    tableMethod: t('invoice.table.method'),
    tableNotes: t('invoice.table.notes'),
    tableAmount: t('invoice.table.amount'),
    totalPaid: t('invoice.total_paid'),
    balanceDue: t('invoice.balance_due'),
    fullyPaid: t('invoice.fully_paid'),
    noPayments: t('invoice.no_payments'),
    footer: t('invoice.footer'),
  };
}

export function eventTypeLabel(booking: Booking, t: Translate): string {
  if (isBuiltInEventType(booking.event_type)) {
    const def = findEventType(booking.event_type);
    if (def) {
      return t(def.label_key);
    }
  }
  return booking.event_type; // custom bookings store the free-text label itself
}

export function buildInvoiceData(
  booking: Booking,
  payments: BookingPayment[],
  business: Business,
  invoiceNumber: string,
  t: Translate,
): InvoiceData {
  return {
    businessName: business.name,
    businessType: business.business_type,
    address: business.address,
    ownerName: business.owner_name,
    invoiceNumber,
    issueDate: todayIso(),
    customerName: booking.customer_name,
    customerPhone: booking.customer_phone,
    eventIcon: booking.event_icon,
    eventLabel: eventTypeLabel(booking, t),
    startDate: booking.start_date,
    endDate: booking.end_date,
    startTime: booking.start_time,
    endTime: booking.end_time,
    totalAmount: booking.total_amount,
    securityDeposit: booking.security_deposit,
    payments: payments
      .filter((p) => p.deleted_at === null)
      .map((p) => ({
        paidOn: p.paid_on,
        methodLabel: t(`invoice.method.${p.method}`),
        notes: p.notes,
        amount: p.amount,
      })),
  };
}

/** Fetches the embedded PDF fonts (Mukta: Latin + Devanagari + ₹) from /public. */
export async function fetchInvoiceFonts(): Promise<{ regular: ArrayBuffer; bold: ArrayBuffer }> {
  const [regular, bold] = await Promise.all([
    fetch('/fonts/Mukta-Regular.ttf').then((r) => r.arrayBuffer()),
    fetch('/fonts/Mukta-Bold.ttf').then((r) => r.arrayBuffer()),
  ]);
  return { regular, bold };
}

/** Optional header logo from the private `logos` bucket. */
export async function fetchLogoPng(db: SupabaseClient, business: Business): Promise<Uint8Array | undefined> {
  if (!business.logo_path || !business.logo_path.toLowerCase().endsWith('.png')) {
    return undefined;
  }
  const { data } = await db.storage.from('logos').download(business.logo_path);
  if (!data) {
    return undefined;
  }
  return new Uint8Array(await data.arrayBuffer());
}

export function downloadPdf(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
