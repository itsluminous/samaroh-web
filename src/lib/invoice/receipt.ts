// "Share as text" receipt (shared/invoice/layout-spec.md, Text variant):
// mirrors the PDF order — business name, invoice number, customer,
// event + dates, total / deposit / paid / due, then one line per payment —
// with the same localized labels and the same ₹ formatting.

import { formatDate, formatDateRange } from '@/lib/booking/dates';
import { formatRupees } from '@/lib/booking/money';
import type { InvoiceData, InvoiceLabels } from './types';

const SEPARATOR = ' \u00B7 '; // middot, matches the summary-card convention

export function buildTextReceipt(data: InvoiceData, labels: InvoiceLabels, locale: string): string {
  const paid = data.payments.reduce((sum, p) => sum + Math.round(p.amount * 100), 0) / 100;
  const due = (Math.round(data.totalAmount * 100) - Math.round(paid * 100)) / 100;

  const lines: string[] = [];
  lines.push(data.businessName);
  lines.push(`${labels.numberLabel} ${data.invoiceNumber}${SEPARATOR}${formatDate(data.issueDate, locale)}`);
  lines.push('');
  const phone = data.customerPhone ? ` (${data.customerPhone})` : '';
  lines.push(`${labels.billedTo}: ${data.customerName}${phone}`);
  lines.push(
    `${data.eventIcon} ${data.eventLabel}${SEPARATOR}${formatDateRange(data.startDate, data.endDate, locale)}`,
  );
  lines.push('');
  lines.push(`${labels.totalAmount}: ${formatRupees(data.totalAmount)}`);
  if (data.securityDeposit > 0) {
    lines.push(`${labels.securityDeposit}: ${formatRupees(data.securityDeposit)}`);
  }
  lines.push(`${labels.totalPaid}: ${formatRupees(paid)}`);
  if (due > 0) {
    lines.push(`${labels.balanceDue}: ${formatRupees(due)}`);
  } else {
    lines.push(`${labels.balanceDue}: ${formatRupees(0)}${SEPARATOR}${labels.fullyPaid}`);
  }
  if (data.payments.length > 0) {
    lines.push('');
    lines.push(labels.paymentHistory);
    for (const p of data.payments) {
      const note = p.notes ? `${SEPARATOR}${p.notes}` : '';
      lines.push(
        `${formatDate(p.paidOn, locale)}${SEPARATOR}${p.methodLabel}${SEPARATOR}${formatRupees(p.amount)}${note}`,
      );
    }
  }
  lines.push('');
  lines.push(labels.footer);
  return lines.join('\n');
}
