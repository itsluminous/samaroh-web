/**
 * "Record expense" on the booking card + the pre-filled entry dialog
 * (shared/docs/expense-against-event.md §1): action HIDDEN (not greyed)
 * without expenses.create, never on markers or cancelled bookings; the
 * EXISTING EntryDialog opens pre-filled (customer shown, direction "You
 * gave" but editable, notes = `{eventType} · {dates}`, amount empty) and on
 * save writes ONE expenses row with booking_id — the party being resolved or
 * created at save time; a forbidden create shows the blocking message and
 * writes nothing.
 */
import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '../messages/en.json';
import BookingDetail from '@/app/[locale]/(app)/booking/components/BookingDetail';
import EntryDialog from '@/app/[locale]/(app)/expenses/_components/EntryDialog';
import type { EventTypePreset } from '@/lib/booking/eventTypePresets';
import type { Booking, Business } from '@/lib/booking/types';
import { OWNER_PERMISSIONS } from '@/lib/booking/types';
import { createLocalClient } from '@/lib/guest/localClient';
import { guestDb } from '@/lib/guest/localDb';
import { makeBooking } from '../test-utils/fixtures';

const mockClient = createLocalClient();

jest.mock('@/lib/hooks/useBusiness', () => ({
  useBusiness: () => ({
    supabase: mockClient,
    businessId: 'biz-1',
    businessName: 'Shree Ganesh Hall',
    userId: 'u1',
    loading: false,
    error: null,
  }),
}));

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

const markerPreset: EventTypePreset = {
  id: 'et-lagan',
  label: 'Lagan',
  icon: '\u2B50',
  color: null,
  kind: 'marker',
  sort_order: 1,
} as EventTypePreset;

function renderDetail(booking: Booking, canRecordExpense: boolean, presets: EventTypePreset[] | null = null) {
  const onRecordExpense = jest.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <BookingDetail
        booking={booking}
        payments={[]}
        business={business}
        memberNames={{}}
        permissions={OWNER_PERMISSIONS}
        presets={presets}
        onClose={jest.fn()}
        onEdit={jest.fn()}
        onRecordPayment={jest.fn()}
        onRecordExpense={onRecordExpense}
        canRecordExpense={canRecordExpense}
        onCancelBooking={jest.fn()}
        onRestoreBooking={jest.fn()}
        onDeleteBooking={jest.fn()}
        onInvoicePdf={jest.fn()}
        onInvoiceText={jest.fn()}
        invoiceBusy={false}
      />
    </NextIntlClientProvider>,
  );
  return onRecordExpense;
}

const actionLabel = en.booking.card.action_record_expense;

describe('BookingDetail — Record expense action', () => {
  it('sits beside Record payment and fires the handler when expenses.create is held', () => {
    const onRecordExpense = renderDetail(makeBooking({ status: 'confirmed' }), true);
    const button = screen.getByRole('button', { name: actionLabel });
    expect(screen.getByRole('button', { name: en.booking.card.action_record_payment })).toBeInTheDocument();
    fireEvent.click(button);
    expect(onRecordExpense).toHaveBeenCalledTimes(1);
  });

  it('is HIDDEN (not disabled) without expenses.create', () => {
    renderDetail(makeBooking({ status: 'confirmed' }), false);
    expect(screen.queryByRole('button', { name: actionLabel })).not.toBeInTheDocument();
    expect(screen.queryByText(actionLabel)).not.toBeInTheDocument();
  });

  it('is hidden on cancelled bookings and on marker bookings', () => {
    renderDetail(makeBooking({ status: 'cancelled' }), true);
    expect(screen.queryByText(actionLabel)).not.toBeInTheDocument();
  });

  it('is hidden on marker-kind bookings (day indicators carry no money)', () => {
    renderDetail(makeBooking({ event_type: 'Lagan', status: 'confirmed' }), true, [markerPreset]);
    expect(screen.queryByText(actionLabel)).not.toBeInTheDocument();
  });

  it('tentative bookings still get the action (only cancelled/marker are excluded)', () => {
    renderDetail(makeBooking({ status: 'tentative' }), true);
    expect(screen.getByRole('button', { name: actionLabel })).toBeInTheDocument();
  });
});

describe('EntryDialog — booking pre-fill mode', () => {
  const booking = makeBooking({
    id: 'bk-7',
    customer_name: 'Priya Sharma',
    customer_phone: '9876543210',
    start_date: '2026-07-10',
    end_date: '2026-07-12',
  });
  const notesDefault = 'Wedding \u00B7 Jul 10, 2026 \u2013 Jul 12, 2026';

  beforeEach(async () => {
    await Promise.all([guestDb.parties.clear(), guestDb.expenses.clear()]);
  });

  function openDialog(canManageParties: boolean, onSaved = jest.fn()) {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <EntryDialog
          open
          partyId={null}
          direction="paid"
          entry={null}
          canDelete={false}
          bookingPrefill={{ booking, notesDefault, canManageParties }}
          onClose={jest.fn()}
          onSaved={onSaved}
        />
      </NextIntlClientProvider>,
    );
    return onSaved;
  }

  it('pre-fills: title, customer, direction "You gave" (editable), notes default, empty amount', () => {
    openDialog(true);
    expect(screen.getByRole('heading', { name: actionLabel })).toBeInTheDocument();
    expect(screen.getByTestId('entry-party-name')).toHaveTextContent('Priya Sharma');
    const gave = screen.getByRole('button', { name: en.expenses.home.you_gave });
    const got = screen.getByRole('button', { name: en.expenses.home.you_got });
    expect(gave).toHaveAttribute('aria-pressed', 'true');
    expect(got).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText(en.expenses.entry.notes_label)).toHaveValue(notesDefault);
    expect(screen.getByLabelText(en.expenses.entry.amount_label)).toHaveValue('');
    fireEvent.click(got);
    expect(got).toHaveAttribute('aria-pressed', 'true');
  });

  it('saving resolves/creates the customer party and writes ONE expense row with booking_id', async () => {
    const onSaved = openDialog(true);
    fireEvent.change(screen.getByLabelText(en.expenses.entry.amount_label), { target: { value: '2500' } });
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));

    const parties = await guestDb.parties.toArray();
    expect(parties).toHaveLength(1);
    expect(parties[0]).toMatchObject({ name: 'Priya Sharma', phone: '9876543210', business_related: false });
    const expenses = await guestDb.expenses.toArray();
    expect(expenses).toHaveLength(1);
    expect(expenses[0]).toMatchObject({
      party_id: parties[0]!.id,
      direction: 'paid',
      amount: 2500,
      notes: notesDefault,
      booking_id: 'bk-7',
      business_id: 'biz-1',
      created_by: 'u1',
    });
  });

  it('nothing is written on open — the party is resolved on SAVE only', async () => {
    openDialog(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(await guestDb.parties.count()).toBe(0);
    expect(await guestDb.expenses.count()).toBe(0);
  });

  it('member without manage_parties and no live party: blocking message, nothing written', async () => {
    const onSaved = openDialog(false);
    fireEvent.change(screen.getByLabelText(en.expenses.entry.amount_label), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    const expected = en.expenses.entry.party_create_forbidden.replace('{name}', 'Priya Sharma');
    expect(await screen.findByRole('alert')).toHaveTextContent(expected);
    expect(onSaved).not.toHaveBeenCalled();
    expect(await guestDb.parties.count()).toBe(0);
    expect(await guestDb.expenses.count()).toBe(0);
  });

  it('member without manage_parties CAN save when the customer already exists as a live party', async () => {
    await guestDb.parties.add({
      id: 'p-priya',
      business_id: 'biz-1',
      name: 'priya sharma',
      phone: null,
      business_related: true,
      created_at: '2026-01-01T00:00:00Z',
      deleted_at: null,
    });
    const onSaved = openDialog(false);
    fireEvent.change(screen.getByLabelText(en.expenses.entry.amount_label), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const expenses = await guestDb.expenses.toArray();
    expect(expenses[0]).toMatchObject({ party_id: 'p-priya', booking_id: 'bk-7' });
    expect(await guestDb.parties.count()).toBe(1);
  });
});
