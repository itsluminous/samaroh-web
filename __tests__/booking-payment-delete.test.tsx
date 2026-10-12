/**
 * Delete a recorded payment (booking card payment history):
 *  - per-row trash IconButton gated on booking.record_payment (owners always);
 *    HIDDEN (not greyed) otherwise and on cancelled bookings;
 *  - confirmation dialog (booking.payment.delete_confirm_title/body with the
 *    row's amount + date, destructive confirm) — dismiss never deletes;
 *  - repo mutation = soft-delete tombstone through the offline-aware data
 *    layer (deleted_at, never a hard delete);
 *  - guest (Dexie) mode end-to-end: tombstoned row drops out of the live
 *    payment reads and the due recomputes from the remaining payments;
 *  - offline signed-in mode: the tombstone is queued as an outbox delete op.
 */
import 'fake-indexeddb/auto';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { NextIntlClientProvider } from 'next-intl';
import theme from '@/theme/theme';
import en from '../messages/en.json';
import BookingDetail from '@/app/[locale]/(app)/booking/components/BookingDetail';
import { computeDue, computePaid } from '@/lib/booking/due';
import { deletePayment, fetchPaymentsByBooking } from '@/lib/booking/repo';
import type { Booking, BookingPayment, BookingPermissions, Business } from '@/lib/booking/types';
import { OWNER_PERMISSIONS } from '@/lib/booking/types';
import { createLocalClient } from '@/lib/guest/localClient';
import { guestDb } from '@/lib/guest/localDb';
import { outboxDb } from '@/lib/outbox/db';
import { listItems } from '@/lib/outbox/outbox';
import { makeBooking, makePayment } from '../test-utils/fixtures';

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

const viewOnly: BookingPermissions = {
  view: true,
  create: false,
  edit: false,
  delete: false,
  record_payment: false,
  generate_invoice: false,
  view_amounts: true,
};

const DELETE_LABEL = en.booking.payment.delete;

function renderDetail(
  booking: Booking,
  payments: BookingPayment[],
  permissions: BookingPermissions,
  onDeletePayment: ((p: BookingPayment) => void) | 'none' = jest.fn(),
) {
  return render(
    <ThemeProvider theme={theme}>
      <NextIntlClientProvider locale="en" messages={en}>
        <BookingDetail
          booking={booking}
          payments={payments}
          business={business}
          memberNames={{ 'user-1': 'Meera' }}
          permissions={permissions}
          presets={null}
          onClose={jest.fn()}
          onEdit={jest.fn()}
          onRecordPayment={jest.fn()}
          onDeletePayment={onDeletePayment === 'none' ? undefined : onDeletePayment}
          onCancelBooking={jest.fn()}
          onRestoreBooking={jest.fn()}
          onDeleteBooking={jest.fn()}
          onInvoicePdf={jest.fn()}
          onInvoiceText={jest.fn()}
          invoiceBusy={false}
        />
      </NextIntlClientProvider>
    </ThemeProvider>,
  );
}

const twoPayments = () => [
  makePayment({ id: 'pay-a', amount: 30000, paid_on: '2026-07-01' }),
  makePayment({ id: 'pay-b', amount: 20000, paid_on: '2026-07-05', method: 'upi' }),
];

describe('payment row trash action — gating (hide, never grey)', () => {
  it('owner sees one trash button per payment row', () => {
    renderDetail(makeBooking(), twoPayments(), OWNER_PERMISSIONS);
    const rows = screen.getAllByTestId('payment-row');
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(within(row).getByRole('button', { name: DELETE_LABEL })).toBeEnabled();
    }
  });

  it('record_payment member (no edit/delete) sees the trash button', () => {
    renderDetail(makeBooking(), twoPayments(), { ...viewOnly, record_payment: true });
    expect(screen.getAllByRole('button', { name: DELETE_LABEL })).toHaveLength(2);
  });

  it('member without record_payment: the button is ABSENT, not disabled', () => {
    renderDetail(makeBooking(), twoPayments(), { ...viewOnly, edit: true, delete: true });
    expect(screen.queryByRole('button', { name: DELETE_LABEL })).toBeNull();
    expect(screen.queryByLabelText(DELETE_LABEL)).toBeNull();
    // The rows themselves still render.
    expect(screen.getAllByTestId('payment-row')).toHaveLength(2);
  });

  it('cancelled booking: payment history stays, trash is hidden even for the owner', () => {
    renderDetail(makeBooking({ status: 'cancelled' }), twoPayments(), OWNER_PERMISSIONS);
    expect(screen.getAllByTestId('payment-row')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: DELETE_LABEL })).toBeNull();
  });

  it('no handler wired → no trash button (hosts that cannot delete never show it)', () => {
    renderDetail(makeBooking(), twoPayments(), OWNER_PERMISSIONS, 'none');
    expect(screen.queryByRole('button', { name: DELETE_LABEL })).toBeNull();
  });

  it('no payments → the empty-state line and no trash buttons', () => {
    renderDetail(makeBooking(), [], OWNER_PERMISSIONS);
    expect(screen.getByText(en.booking.card.no_payments)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: DELETE_LABEL })).toBeNull();
  });
});

describe('payment delete confirmation dialog', () => {
  it('opens with the catalog title and an amount + date body; confirm fires the handler with THAT payment', () => {
    const onDeletePayment = jest.fn();
    renderDetail(makeBooking(), twoPayments(), OWNER_PERMISSIONS, onDeletePayment);
    const rows = screen.getAllByTestId('payment-row');
    fireEvent.click(within(rows[1] as HTMLElement).getByRole('button', { name: DELETE_LABEL }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(en.booking.payment.delete_confirm_title)).toBeInTheDocument();
    // Body interpolates the second row's amount (Indian grouping) and date.
    const body = within(dialog).getByText(/will be removed and the due recalculated/);
    expect(body.textContent).toContain('20,000');
    expect(body.textContent).toContain('2026');
    expect(body.textContent).not.toContain('{amount}');
    expect(onDeletePayment).not.toHaveBeenCalled();

    // Confirm reads "Delete" (common.action.delete) — Android parity; the row
    // tooltip "Delete payment" never appears inside the dialog.
    const confirm = within(dialog).getByRole('button', { name: en.common.action.delete });
    expect(confirm).toHaveClass('MuiButton-colorError');
    expect(within(dialog).queryByRole('button', { name: DELETE_LABEL })).toBeNull();
    fireEvent.click(confirm);
    expect(onDeletePayment).toHaveBeenCalledTimes(1);
    expect(onDeletePayment.mock.calls[0]?.[0]?.id).toBe('pay-b');
  });

  it('dismissing with Cancel never deletes', () => {
    const onDeletePayment = jest.fn();
    renderDetail(makeBooking(), twoPayments(), OWNER_PERMISSIONS, onDeletePayment);
    fireEvent.click(screen.getAllByRole('button', { name: DELETE_LABEL })[0] as HTMLElement);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: en.common.action.cancel }));
    expect(onDeletePayment).not.toHaveBeenCalled();
  });

  it('masks the amount in the body when view_amounts is off', () => {
    renderDetail(makeBooking(), twoPayments(), { ...OWNER_PERMISSIONS, view_amounts: false });
    fireEvent.click(screen.getAllByRole('button', { name: DELETE_LABEL })[0] as HTMLElement);
    const dialog = screen.getByRole('dialog');
    const body = within(dialog).getByText(/will be removed and the due recalculated/);
    expect(body.textContent).not.toContain('30,000');
    expect(body.textContent).toContain('•');
  });
});

describe('due recomputation after a tombstone', () => {
  it('a tombstoned payment stops counting towards paid and the due grows back', () => {
    const payments = twoPayments();
    expect(computePaid(payments)).toBe(50000);
    expect(computeDue(100000, payments)).toBe(50000);
    const after = payments.map((p) => (p.id === 'pay-b' ? { ...p, deleted_at: '2026-07-06T00:00:00Z' } : p));
    expect(computePaid(after)).toBe(30000);
    expect(computeDue(100000, after)).toBe(70000);
  });

  it('deleting every payment makes the full total due again', () => {
    const after = twoPayments().map((p) => ({ ...p, deleted_at: '2026-07-06T00:00:00Z' }));
    expect(computePaid(after)).toBe(0);
    expect(computeDue(100000, after)).toBe(100000);
  });
});

describe('deletePayment repo mutation (online)', () => {
  it('writes a deleted_at tombstone on booking_payments by id — never a hard delete', async () => {
    const eq = jest.fn(() => Promise.resolve({ error: null }));
    const update = jest.fn((_patch: Record<string, unknown>) => ({ eq }));
    const del = jest.fn();
    const from = jest.fn(() => ({ update, delete: del }));
    const booking = makeBooking();
    const payment = makePayment({ id: 'pay-x', booking_id: booking.id });
    await deletePayment({ from } as never, booking, payment);
    expect(from).toHaveBeenCalledWith('booking_payments');
    expect(del).not.toHaveBeenCalled();
    const patch = (update.mock.calls[0]?.[0] ?? {}) as Record<string, unknown>;
    expect(typeof patch.deleted_at).toBe('string');
    expect(typeof patch.updated_at).toBe('string');
    expect(patch.amount).toBeUndefined();
    expect(eq).toHaveBeenCalledWith('id', 'pay-x');
  });
});

describe('deletePayment in guest (Dexie) mode', () => {
  const client = createLocalClient();

  beforeEach(async () => {
    await Promise.all(guestDb.tables.map((t) => t.clear()));
  });

  it('tombstones locally: live reads drop the row, the raw row survives, due recomputes', async () => {
    const booking = makeBooking({ id: 'guest-bk-1', total_amount: 100000 });
    const [a, b] = twoPayments().map((p) => ({ ...p, booking_id: booking.id }));
    await client.from('booking_payments').insert([a, b] as unknown as Record<string, unknown>[]);

    const before = await fetchPaymentsByBooking(client, [booking.id]);
    expect(computeDue(booking.total_amount, before[booking.id] ?? [])).toBe(50000);

    await deletePayment(client, booking, b as BookingPayment);

    const after = await fetchPaymentsByBooking(client, [booking.id]);
    expect((after[booking.id] ?? []).map((p) => p.id)).toEqual(['pay-a']);
    expect(computeDue(booking.total_amount, after[booking.id] ?? [])).toBe(70000);

    const { data: raw } = await client.from('booking_payments').select('id, deleted_at').eq('id', 'pay-b').single();
    expect((raw as { deleted_at: string | null }).deleted_at).not.toBeNull();
    // Nothing queued — guest writes never touch the outbox.
    expect(await listItems()).toEqual([]);
  });
});

describe('deletePayment offline (signed-in, navigator.onLine = false)', () => {
  const onLine = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(navigator), 'onLine');

  beforeEach(async () => {
    await Promise.all([outboxDb.outbox.clear(), outboxDb.meta.clear()]);
    Object.defineProperty(Object.getPrototypeOf(navigator), 'onLine', { configurable: true, get: () => false });
  });

  afterEach(() => {
    if (onLine) {
      Object.defineProperty(Object.getPrototypeOf(navigator), 'onLine', onLine);
    }
  });

  it('queues an outbox delete op carrying the tombstone instead of hitting the server', async () => {
    const from = jest.fn();
    const booking = makeBooking();
    const payment = makePayment({ id: 'pay-off', booking_id: booking.id });
    await deletePayment({ from } as never, booking, payment);
    expect(from).not.toHaveBeenCalled();
    const items = await listItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      table: 'booking_payments',
      entity_id: 'pay-off',
      operation: 'delete',
      label: booking.customer_name,
    });
    expect(typeof (items[0]?.payload as Record<string, unknown>).deleted_at).toBe('string');
  });
});
