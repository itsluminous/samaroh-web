/**
 * Booking card — the action row is a STICKY footer of the bottom drawer (Android
 * ADR-107 parity): with long notes + a payment history + an expenses history the
 * body scrolls inside the drawer paper while Record payment / Record expense /
 * Invoice / WhatsApp stay pinned at the bottom edge, reachable without scrolling.
 */
import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '../messages/en.json';
import BookingDetail from '@/app/[locale]/(app)/booking/components/BookingDetail';
import type { Business } from '@/lib/booking/types';
import { OWNER_PERMISSIONS } from '@/lib/booking/types';
import type { BookingExpenseRow } from '@/lib/expenses/bookingExpense';
import { makeBooking, makePayment } from '../test-utils/fixtures';

const business: Business = {
  id: 'biz-1',
  name: 'Shree Ganesh Hall',
  business_type: 'banquet_hall',
  address: null,
  owner_name: 'Suresh Gupta',
  logo_path: null,
  invoice_prefix: 'INV',
  invoice_counter: 1,
  owner_user_id: 'owner-1',
};

const longNotes = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}: stage on the east lawn, caterer at 4 pm, 400 chairs.`).join('\n');

const expenses: BookingExpenseRow[] = Array.from({ length: 5 }, (_, i) => ({
  id: `e-${i}`,
  direction: i % 2 ? 'received' : 'paid',
  amount: 1500,
  expense_date: `2026-07-${String(10 + i).padStart(2, '0')}`,
  notes: `Decoration ${i}`,
  created_at: `2026-07-${String(10 + i).padStart(2, '0')}T10:00:00Z`,
}));

function renderLongDetail() {
  const booking = makeBooking({ id: 'bk-1', total_amount: 500000, notes: longNotes });
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <BookingDetail
        booking={booking}
        payments={Array.from({ length: 6 }, (_, i) => makePayment({ id: `p-${i}`, booking_id: booking.id, amount: 20000 }))}
        business={business}
        memberNames={{}}
        permissions={OWNER_PERMISSIONS}
        presets={null}
        onClose={jest.fn()}
        onEdit={jest.fn()}
        onRecordPayment={jest.fn()}
        onRecordExpense={jest.fn()}
        canRecordExpense
        onCancelBooking={jest.fn()}
        onRestoreBooking={jest.fn()}
        onDeleteBooking={jest.fn()}
        onInvoicePdf={jest.fn()}
        onInvoiceText={jest.fn()}
        invoiceBusy={false}
        expenses={expenses}
        canViewExpenses
        showExpenseAmounts
      />
    </NextIntlClientProvider>,
  );
}

describe('BookingDetail — sticky action footer', () => {
  it('pins the action row to the bottom of the scrolling drawer and keeps every primary action inside it', () => {
    renderLongDetail();
    const actions = screen.getByTestId('booking-detail-actions');
    expect(actions).toHaveStyle({ position: 'sticky', bottom: '0px' });

    expect(within(actions).getByRole('button', { name: en.booking.card.action_record_payment })).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: en.booking.card.action_record_expense })).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: en.booking.card.action_invoice })).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: en.common.action.edit })).toBeInTheDocument();

    // The long content is all rendered (the footer sticks over it; nothing is dropped).
    expect(screen.getAllByTestId('payment-row')).toHaveLength(6);
    expect(screen.getAllByTestId('expense-row')).toHaveLength(5);
    // The footer comes AFTER the histories in DOM order (it is the last section of the body).
    const total = screen.getByText(en.booking.card.expenses_total);
    expect(total.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
