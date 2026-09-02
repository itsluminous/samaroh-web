/**
 * Marker-kind bookings carry NO payment status (parity with Android):
 * the detail drawer hides total/deposit/paid/due, the payment history and
 * the record-payment/invoice actions; agenda/month rows show no due or
 * fully-paid chip; and the month summary's Received/Pending exclude them.
 */
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import theme from '@/theme/theme';
import en from '../messages/en.json';
import BookingDetail from '@/app/[locale]/(app)/booking/components/BookingDetail';
import BookingRow from '@/app/[locale]/(app)/booking/components/BookingRow';
import { monthMoneySummary } from '@/lib/booking/due';
import type { EventTypePreset } from '@/lib/booking/eventTypePresets';
import type { Booking, Business } from '@/lib/booking/types';
import { OWNER_PERMISSIONS } from '@/lib/booking/types';
import { makeBooking, makePayment } from '../test-utils/fixtures';

function makePreset(overrides: Partial<EventTypePreset>): EventTypePreset {
  return {
    id: 'p-x',
    business_id: 'biz-1',
    label: 'X',
    icon: '\u2728',
    color: null,
    kind: 'booking',
    sort_order: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

const presets = [
  makePreset({ id: 'p1', label: 'Wedding', kind: 'booking' }),
  makePreset({ id: 'p2', label: 'Lagan', kind: 'marker' }),
];

const business: Business = {
  id: 'biz-1',
  name: 'Biz Palace',
  business_type: 'banquet_hall',
  address: null,
  owner_name: 'Owner Om',
  logo_path: null,
  invoice_prefix: 'INV',
  invoice_counter: 1,
  owner_user_id: 'owner-1',
};

function renderIntl(node: ReactNode) {
  return render(
    <ThemeProvider theme={theme}>
      <NextIntlClientProvider locale="en" messages={en}>
        {node}
      </NextIntlClientProvider>
    </ThemeProvider>,
  );
}

function renderDetail(booking: Booking) {
  return renderIntl(
    <BookingDetail
      booking={booking}
      payments={[]}
      business={business}
      memberNames={{ 'user-1': 'Meera' }}
      permissions={OWNER_PERMISSIONS}
      presets={presets}
      onClose={jest.fn()}
      onEdit={jest.fn()}
      onRecordPayment={jest.fn()}
      onCancelBooking={jest.fn()}
      onInvoicePdf={jest.fn()}
      onInvoiceText={jest.fn()}
      invoiceBusy={false}
    />,
  );
}

describe('BookingDetail — marker kind hides all payment status', () => {
  const marker = makeBooking({ event_type: 'Lagan', total_amount: 0 });

  it('shows no total/deposit/paid/due rows and no payment history', () => {
    renderDetail(marker);
    expect(screen.queryByText(en.booking.card.total_label)).not.toBeInTheDocument();
    expect(screen.queryByText(en.booking.card.deposit_label)).not.toBeInTheDocument();
    expect(screen.queryByText(en.booking.card.paid_label)).not.toBeInTheDocument();
    expect(screen.queryByText(en.booking.card.due_label)).not.toBeInTheDocument();
    expect(screen.queryByText(en.booking.card.payments_title)).not.toBeInTheDocument();
    expect(screen.queryByText(en.booking.card.no_payments)).not.toBeInTheDocument();
  });

  it('hides the record-payment and invoice actions; edit stays', () => {
    renderDetail(marker);
    expect(screen.queryByText(en.booking.card.action_record_payment)).not.toBeInTheDocument();
    expect(screen.queryByText(en.booking.card.action_invoice)).not.toBeInTheDocument();
    expect(screen.getByText(en.common.action.edit)).toBeInTheDocument();
  });

  it('a booking-kind booking keeps the full financial card', () => {
    renderDetail(makeBooking({ event_type: 'Wedding', total_amount: 50000 }));
    expect(screen.getByText(en.booking.card.total_label)).toBeInTheDocument();
    expect(screen.getByText(en.booking.card.due_label)).toBeInTheDocument();
    expect(screen.getByText(en.booking.card.payments_title)).toBeInTheDocument();
    expect(screen.getByText(en.booking.card.action_record_payment)).toBeInTheDocument();
    expect(screen.getByText(en.booking.card.action_invoice)).toBeInTheDocument();
  });
});

describe('BookingRow — marker kind shows no due/fully-paid chip', () => {
  it('marker rows carry neither chip', () => {
    renderIntl(
      <BookingRow
        booking={makeBooking({ event_type: 'Lagan', total_amount: 0 })}
        payments={[]}
        presets={presets}
        onClick={jest.fn()}
      />,
    );
    expect(screen.queryByText(new RegExp(`${en.booking.card.due_label}:`))).not.toBeInTheDocument();
    expect(screen.queryByText(en.invoice.fully_paid)).not.toBeInTheDocument();
  });

  it('booking-kind rows keep the due chip', () => {
    renderIntl(
      <BookingRow
        booking={makeBooking({ event_type: 'Wedding', total_amount: 50000 })}
        payments={[]}
        presets={presets}
        onClick={jest.fn()}
      />,
    );
    expect(screen.getByText(new RegExp(`${en.booking.card.due_label}:`))).toBeInTheDocument();
  });

  it('a zero-due booking-kind row keeps the fully-paid chip', () => {
    renderIntl(
      <BookingRow
        booking={makeBooking({ event_type: 'Wedding', total_amount: 0 })}
        payments={[]}
        presets={presets}
        onClick={jest.fn()}
      />,
    );
    expect(screen.getByText(en.invoice.fully_paid)).toBeInTheDocument();
  });

  it('a cancelled marker still shows the cancelled chip', () => {
    renderIntl(
      <BookingRow
        booking={makeBooking({ event_type: 'Lagan', status: 'cancelled' })}
        payments={[]}
        presets={presets}
        onClick={jest.fn()}
      />,
    );
    expect(screen.getByText(en.booking.status.cancelled)).toBeInTheDocument();
  });
});

describe('monthMoneySummary — Received/Pending exclude markers', () => {
  const isMarker = (eventType: string) => eventType === 'Lagan';

  it('marker payments and dues never reach the summary', () => {
    const real = makeBooking({ event_type: 'Wedding', total_amount: 100000 });
    // Legacy marker with a nonzero snapshot + payment: excluded by KIND, not amount.
    const legacyMarker = makeBooking({ event_type: 'Lagan', total_amount: 5000 });
    const payments = {
      [real.id]: [makePayment({ booking_id: real.id, amount: 40000 })],
      [legacyMarker.id]: [makePayment({ booking_id: legacyMarker.id, amount: 5000 })],
    };
    expect(monthMoneySummary([real, legacyMarker], payments, isMarker)).toEqual({
      received: 40000,
      pending: 60000,
    });
  });

  it('cancelled bookings stay excluded', () => {
    const cancelled = makeBooking({ event_type: 'Wedding', total_amount: 100, status: 'cancelled' });
    expect(monthMoneySummary([cancelled], {}, isMarker)).toEqual({ received: 0, pending: 0 });
  });
});
