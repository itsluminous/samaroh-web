/**
 * Booking card — "Expenses history" (shared/docs/expense-against-event.md
 * rev 2 §3b): directly below Payment history, styled like it; rows = the
 * booking's live linked expenses newest first (`date · notes` + amount,
 * received rows green); footer `Total expenses` = Σ paid − Σ received, NEVER
 * subtracted from Due; ENTIRELY hidden (no heading, no divider, no empty
 * state) when there are none or without expenses.view; amounts masked per
 * expenses.view_amounts; rows read-only (no tap, no delete).
 */
import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '../messages/en.json';
import BookingDetail from '@/app/[locale]/(app)/booking/components/BookingDetail';
import type { Booking, Business } from '@/lib/booking/types';
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

const rows: BookingExpenseRow[] = [
  { id: 'e-new', direction: 'paid', amount: 3000, expense_date: '2026-07-12', notes: 'Flowers', created_at: '2026-07-12T10:00:00Z' },
  { id: 'e-mid', direction: 'received', amount: 500, expense_date: '2026-07-11', notes: null, created_at: '2026-07-11T10:00:00Z' },
  { id: 'e-old', direction: 'paid', amount: 1200, expense_date: '2026-07-10', notes: 'Tent', created_at: '2026-07-10T10:00:00Z' },
];

function renderDetail(
  overrides: {
    booking?: Booking;
    expenses?: BookingExpenseRow[];
    canViewExpenses?: boolean;
    showExpenseAmounts?: boolean;
  } = {},
) {
  const booking = overrides.booking ?? makeBooking({ id: 'bk-1', total_amount: 100000 });
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <BookingDetail
        booking={booking}
        payments={[makePayment({ booking_id: booking.id, amount: 30000 })]}
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
        expenses={overrides.expenses ?? rows}
        canViewExpenses={overrides.canViewExpenses ?? true}
        showExpenseAmounts={overrides.showExpenseAmounts ?? true}
      />
    </NextIntlClientProvider>,
  );
}

const heading = en.booking.card.expenses_history;
const totalLabel = en.booking.card.expenses_total;

describe('BookingDetail — Expenses history', () => {
  it('lists the linked expenses below Payment history, in the given (newest-first) order, with notes and amounts', () => {
    renderDetail();
    const section = screen.getByTestId('expenses-history');
    expect(within(section).getByText(heading)).toBeInTheDocument();
    const lines = within(section).getAllByTestId('expense-row');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toHaveTextContent('Flowers');
    expect(lines[0]).toHaveTextContent('3,000');
    expect(lines[2]).toHaveTextContent('Tent');
    expect(lines[2]).toHaveTextContent('1,200');
    // Below Payment history: the payments heading precedes the expenses heading in DOM order.
    const paymentsHeading = screen.getByText(en.booking.card.payments_title);
    expect(paymentsHeading.compareDocumentPosition(within(section).getByText(heading)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Read-only: no buttons inside the section (no tap target, no delete).
    expect(within(section).queryAllByRole('button')).toHaveLength(0);
  });

  it('total = Σ paid − Σ received (3000 + 1200 − 500 = 3,700) and Due is UNCHANGED (1,00,000 − 30,000)', () => {
    renderDetail();
    const section = screen.getByTestId('expenses-history');
    expect(within(section).getByText(totalLabel)).toBeInTheDocument();
    expect(within(section).getByText(/3,700/)).toBeInTheDocument();
    // Due stays total − payments; expenses never enter the booking money math.
    expect(screen.getByText(/70,000/)).toBeInTheDocument();
    expect(screen.queryByText(/66,300/)).not.toBeInTheDocument();
  });

  it('is ENTIRELY hidden when the booking has no linked expense (no heading, no total, no empty state)', () => {
    renderDetail({ expenses: [] });
    expect(screen.queryByTestId('expenses-history')).not.toBeInTheDocument();
    expect(screen.queryByText(heading)).not.toBeInTheDocument();
    expect(screen.queryByText(totalLabel)).not.toBeInTheDocument();
    // Payment history itself is untouched.
    expect(screen.getByText(en.booking.card.payments_title)).toBeInTheDocument();
  });

  it('does not exist without expenses.view even when rows exist', () => {
    renderDetail({ canViewExpenses: false });
    expect(screen.queryByTestId('expenses-history')).not.toBeInTheDocument();
    expect(screen.queryByText(heading)).not.toBeInTheDocument();
    expect(screen.queryByText('Flowers')).not.toBeInTheDocument();
  });

  it('masks every amount (rows + total) without expenses.view_amounts; dates and notes stay visible', () => {
    renderDetail({ showExpenseAmounts: false });
    const section = screen.getByTestId('expenses-history');
    expect(within(section).getByText(/Flowers/)).toBeInTheDocument();
    expect(within(section).queryByText(/3,000|1,200|3,700|500/)).not.toBeInTheDocument();
    expect(within(section).getAllByText(/\u20B9\u2022\u2022\u2022/).length).toBeGreaterThanOrEqual(4); // 3 rows + total
  });
});
