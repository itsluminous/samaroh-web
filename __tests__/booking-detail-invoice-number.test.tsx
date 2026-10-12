/**
 * Booking detail "Invoice no." line shows the DISPLAY form of the stored
 * invoice number (layout-spec 2026-10-12): a bare manual register number
 * (`88`, Android ADR-020) renders as `INV-0088` with the business prefix;
 * auto numbers render verbatim; the stored value is untouched.
 */
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '../messages/en.json';
import BookingDetail from '@/app/[locale]/(app)/booking/components/BookingDetail';
import type { Business } from '@/lib/booking/types';
import { OWNER_PERMISSIONS } from '@/lib/booking/types';
import { makeBooking } from '../test-utils/fixtures';

const business: Business = {
  id: 'biz-1',
  name: 'Shree Ganesh Hall',
  business_type: 'banquet_hall',
  address: null,
  owner_name: 'Suresh Gupta',
  logo_path: null,
  invoice_prefix: 'SGH',
  invoice_counter: 1,
  owner_user_id: 'owner-1',
};

function renderDetail(invoiceNumber: string | null) {
  const booking = makeBooking({ invoice_number: invoiceNumber });
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <BookingDetail
        booking={booking}
        payments={[]}
        business={business}
        memberNames={{}}
        permissions={OWNER_PERMISSIONS}
        presets={null}
        onClose={jest.fn()}
        onEdit={jest.fn()}
        onRecordPayment={jest.fn()}
        onCancelBooking={jest.fn()}
        onRestoreBooking={jest.fn()}
        onDeleteBooking={jest.fn()}
        onInvoicePdf={jest.fn()}
        onInvoiceText={jest.fn()}
        invoiceBusy={false}
      />
    </NextIntlClientProvider>,
  );
  return booking;
}

describe('BookingDetail invoice number line', () => {
  it('shows a manual register number in display form with the business prefix', () => {
    const booking = renderDetail('88');
    expect(screen.getByText(`${en.invoice.number_label} SGH-0088`)).toBeInTheDocument();
    expect(screen.queryByText(`${en.invoice.number_label} 88`)).not.toBeInTheDocument();
    expect(booking.invoice_number).toBe('88'); // stored value never changes
  });

  it('shows auto-assigned numbers verbatim', () => {
    renderDetail('SGH-2026-0042');
    expect(screen.getByText(`${en.invoice.number_label} SGH-2026-0042`)).toBeInTheDocument();
  });

  it('shows no line before the first invoice', () => {
    renderDetail(null);
    expect(screen.queryByText(new RegExp(`^${en.invoice.number_label}`))).not.toBeInTheDocument();
  });
});
