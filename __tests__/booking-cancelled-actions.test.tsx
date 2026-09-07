/**
 * Cancelled-booking actions (Android parity): the detail drawer replaces
 * Cancel with Restore (booking.edit gate, back to Confirmed) and permanent
 * Delete (booking.delete gate, localized confirmation, soft-delete
 * tombstone), and hides payment-recording/invoice actions on cancelled
 * bookings. Covers the action matrix by status × permissions, both flows'
 * repo mutations, and the guest-mode Dexie client end-to-end.
 */
import 'fake-indexeddb/auto';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import theme from '@/theme/theme';
import en from '../messages/en.json';
import BookingDetail from '@/app/[locale]/(app)/booking/components/BookingDetail';
import { deleteBooking, restoreBooking } from '@/lib/booking/repo';
import type { Booking, BookingPermissions, BookingStatus, Business } from '@/lib/booking/types';
import { OWNER_PERMISSIONS } from '@/lib/booking/types';
import { createLocalClient } from '@/lib/guest/localClient';
import { guestDb } from '@/lib/guest/localDb';
import { makeBooking } from '../test-utils/fixtures';

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

const noPermissions: BookingPermissions = {
  view: true,
  create: false,
  edit: false,
  delete: false,
  record_payment: false,
  generate_invoice: false,
  view_amounts: true,
};

function renderDetail(
  booking: Booking,
  permissions: BookingPermissions,
  handlers: Partial<{
    onRestoreBooking: () => void;
    onDeleteBooking: () => void;
    onCancelBooking: () => void;
  }> = {},
) {
  return render(
    <ThemeProvider theme={theme}>
      <NextIntlClientProvider locale="en" messages={en}>
        <BookingDetail
          booking={booking}
          payments={[]}
          business={business}
          memberNames={{ 'user-1': 'Meera' }}
          permissions={permissions}
          presets={null}
          onClose={jest.fn()}
          onEdit={jest.fn()}
          onRecordPayment={jest.fn()}
          onCancelBooking={handlers.onCancelBooking ?? jest.fn()}
          onRestoreBooking={handlers.onRestoreBooking ?? jest.fn()}
          onDeleteBooking={handlers.onDeleteBooking ?? jest.fn()}
          onInvoicePdf={jest.fn()}
          onInvoiceText={jest.fn()}
          invoiceBusy={false}
        />
      </NextIntlClientProvider>
    </ThemeProvider>,
  );
}

const label = {
  edit: en.common.action.edit,
  recordPayment: en.booking.card.action_record_payment,
  invoice: en.booking.card.action_invoice,
  whatsapp: en.booking.card.action_whatsapp,
  cancel: en.booking.card.action_cancel_booking,
  restore: en.booking.card.action_restore_booking,
  delete: en.booking.card.action_delete_booking,
};

function visibleActions() {
  return Object.fromEntries(
    Object.entries(label).map(([k, text]) => [k, screen.queryByText(text) !== null]),
  );
}

describe('BookingDetail action matrix — status × permissions', () => {
  const activeStatuses: BookingStatus[] = ['tentative', 'confirmed', 'completed'];

  it.each(activeStatuses)('owner on a %s booking: full active action set, no restore/delete', (status) => {
    renderDetail(makeBooking({ status }), OWNER_PERMISSIONS);
    expect(visibleActions()).toEqual({
      edit: true,
      recordPayment: true,
      invoice: true,
      whatsapp: true,
      cancel: true,
      restore: false,
      delete: false,
    });
  });

  it('owner on a cancelled booking: only Restore + Delete (payment/invoice hidden)', () => {
    renderDetail(makeBooking({ status: 'cancelled' }), OWNER_PERMISSIONS);
    expect(visibleActions()).toEqual({
      edit: false,
      recordPayment: false,
      invoice: false,
      whatsapp: false,
      cancel: false,
      restore: true,
      delete: true,
    });
  });

  it('view-only member on a cancelled booking: no actions at all', () => {
    renderDetail(makeBooking({ status: 'cancelled' }), noPermissions);
    expect(visibleActions()).toEqual({
      edit: false,
      recordPayment: false,
      invoice: false,
      whatsapp: false,
      cancel: false,
      restore: false,
      delete: false,
    });
  });

  it('edit-only member on a cancelled booking: Restore but no Delete', () => {
    renderDetail(makeBooking({ status: 'cancelled' }), { ...noPermissions, edit: true });
    const actions = visibleActions();
    expect(actions.restore).toBe(true);
    expect(actions.delete).toBe(false);
  });

  it('delete-only member on a cancelled booking: Delete but no Restore', () => {
    renderDetail(makeBooking({ status: 'cancelled' }), { ...noPermissions, delete: true });
    const actions = visibleActions();
    expect(actions.restore).toBe(false);
    expect(actions.delete).toBe(true);
  });

  it('delete-only member on a confirmed booking: Cancel only (no restore/delete)', () => {
    renderDetail(makeBooking({ status: 'confirmed' }), { ...noPermissions, delete: true });
    const actions = visibleActions();
    expect(actions.cancel).toBe(true);
    expect(actions.restore).toBe(false);
    expect(actions.delete).toBe(false);
  });

  it('invoice permission does not leak the invoice action onto a cancelled booking', () => {
    renderDetail(makeBooking({ status: 'cancelled' }), { ...noPermissions, generate_invoice: true, record_payment: true });
    expect(visibleActions().invoice).toBe(false);
    expect(visibleActions().recordPayment).toBe(false);
  });
});

describe('BookingDetail restore + delete interactions', () => {
  it('Restore fires immediately (no confirmation dialog)', () => {
    const onRestoreBooking = jest.fn();
    renderDetail(makeBooking({ status: 'cancelled' }), OWNER_PERMISSIONS, { onRestoreBooking });
    fireEvent.click(screen.getByText(label.restore));
    expect(onRestoreBooking).toHaveBeenCalledTimes(1);
  });

  it('Delete asks for confirmation first; confirming fires the callback', () => {
    const onDeleteBooking = jest.fn();
    renderDetail(makeBooking({ status: 'cancelled' }), OWNER_PERMISSIONS, { onDeleteBooking });
    fireEvent.click(screen.getByText(label.delete));
    expect(screen.getByText(en.booking.card.delete_confirm_title)).toBeInTheDocument();
    expect(screen.getByText(en.booking.card.delete_confirm_message)).toBeInTheDocument();
    expect(onDeleteBooking).not.toHaveBeenCalled();
    // The dialog's confirm button carries the same action label — pick the last match.
    const confirms = screen.getAllByText(label.delete);
    fireEvent.click(confirms.at(-1) as HTMLElement);
    expect(onDeleteBooking).toHaveBeenCalledTimes(1);
  });

  it('dismissing the delete confirmation never deletes', () => {
    const onDeleteBooking = jest.fn();
    renderDetail(makeBooking({ status: 'cancelled' }), OWNER_PERMISSIONS, { onDeleteBooking });
    fireEvent.click(screen.getByText(label.delete));
    fireEvent.click(screen.getByText(en.common.action.cancel));
    expect(onDeleteBooking).not.toHaveBeenCalled();
  });
});

describe('restoreBooking / deleteBooking repo mutations', () => {
  function mockDb() {
    const eq = jest.fn(() => Promise.resolve({ error: null }));
    const update = jest.fn((_patch: Record<string, unknown>) => ({ eq }));
    const from = jest.fn(() => ({ update }));
    return { db: { from } as never, from, update, eq };
  }

  it('restore patches status back to confirmed with audit stamps', async () => {
    const { db, from, update, eq } = mockDb();
    const booking = makeBooking({ status: 'cancelled' });
    await restoreBooking(db, booking, 'user-9');
    expect(from).toHaveBeenCalledWith('bookings');
    const patch = update.mock.calls[0]?.[0] ?? {};
    expect(patch.status).toBe('confirmed');
    expect(patch.updated_by).toBe('user-9');
    expect(typeof patch.updated_at).toBe('string');
    expect(patch.deleted_at).toBeUndefined();
    expect(eq).toHaveBeenCalledWith('id', booking.id);
  });

  it('delete writes a tombstone (deleted_at), never a hard delete', async () => {
    const { db, from, update, eq } = mockDb();
    const booking = makeBooking({ status: 'cancelled' });
    await deleteBooking(db, booking, 'user-9');
    expect(from).toHaveBeenCalledWith('bookings');
    const patch = update.mock.calls[0]?.[0] ?? {};
    expect(typeof patch.deleted_at).toBe('string');
    expect(patch.updated_by).toBe('user-9');
    expect(patch.status).toBeUndefined();
    expect(eq).toHaveBeenCalledWith('id', booking.id);
  });
});

describe('guest mode (Dexie local client) restore + delete', () => {
  const client = createLocalClient();

  beforeEach(async () => {
    await Promise.all(guestDb.tables.map((t) => t.clear()));
  });

  it('restore flips a cancelled guest booking back to confirmed locally', async () => {
    const booking = makeBooking({ id: 'guest-bk-1', status: 'cancelled' });
    await client.from('bookings').insert(booking as unknown as Record<string, unknown>);
    await restoreBooking(client as never, booking, 'guest-user');
    const { data } = await client.from('bookings').select('id, status, updated_by').eq('id', 'guest-bk-1').single();
    expect((data as { status: string }).status).toBe('confirmed');
    expect((data as { updated_by: string }).updated_by).toBe('guest-user');
  });

  it('delete tombstones a guest booking so deleted_at-filtered reads drop it', async () => {
    const booking = makeBooking({ id: 'guest-bk-2', status: 'cancelled' });
    await client.from('bookings').insert(booking as unknown as Record<string, unknown>);
    await deleteBooking(client as never, booking, 'guest-user');
    const { data: visible } = await client
      .from('bookings')
      .select('id')
      .eq('business_id', booking.business_id)
      .is('deleted_at', null);
    expect(visible).toEqual([]);
    // The row itself survives as a tombstone (soft delete, never hard).
    const { data: raw } = await client.from('bookings').select('id, deleted_at').eq('id', 'guest-bk-2').single();
    expect((raw as { deleted_at: string | null }).deleted_at).not.toBeNull();
  });
});
