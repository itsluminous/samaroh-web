/**
 * Party-ledger event chip (shared/docs/expense-against-event.md §3): an
 * entry with booking_id shows `Event: {firstName · EventType}` as a normal
 * small chip (content, not MetadataText); tap opens that booking's detail on
 * the Booking page (`/booking?open=<id>`) when booking.view is held,
 * otherwise the chip is shown but inert; an unresolvable booking falls back
 * to the notes' first segment, and is omitted when the notes lost the default
 * shape. Never a raw id.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { NextIntlClientProvider } from 'next-intl';
import theme from '@/theme/theme';
import en from '../messages/en.json';
import PartyLedger from '@/app/[locale]/(app)/expenses/_components/PartyLedger';
import type { ExpenseRecord, LinkedBooking } from '@/app/[locale]/(app)/expenses/_lib/queries';
import { normalizePermissions, type MemberPermissions } from '@/lib/permissions/permissions';

const push = jest.fn();
let isOwner = true;
let permissions: MemberPermissions = normalizePermissions({});

jest.mock('@/lib/permissions/useMembership', () => ({
  useMembership: () => ({
    supabase: {},
    business: { id: 'b1', name: 'Biz' },
    userId: 'u1',
    isOwner,
    permissions,
    loading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));

jest.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push }),
}));

const party = { id: 'p1', name: 'Priya Sharma', phone: null, business_related: false, created_at: '2026-01-01T00:00:00Z' };

function expense(overrides: Partial<ExpenseRecord>): ExpenseRecord {
  return {
    id: 'e1',
    party_id: 'p1',
    direction: 'paid',
    amount: 500,
    expense_date: '2026-07-10',
    notes: null,
    booking_id: null,
    created_at: '2026-07-10T00:00:00Z',
    expense_attachments: [],
    ...overrides,
  };
}

const wedding: LinkedBooking = {
  id: 'bk-1',
  customer_name: 'Priya Sharma',
  event_type: 'wedding',
  event_icon: '\u{1F492}',
  status: 'confirmed',
  start_date: '2026-07-10',
  end_date: '2026-07-10',
  deleted_at: null,
};

let expenses: ExpenseRecord[] = [];
let linked: Record<string, LinkedBooking> = {};

jest.mock('@/app/[locale]/(app)/expenses/_lib/queries', () => ({
  ...jest.requireActual('@/app/[locale]/(app)/expenses/_lib/queries'),
  fetchParty: jest.fn(() => Promise.resolve(party)),
  fetchPartyExpenses: jest.fn(() => Promise.resolve(expenses)),
  fetchLinkedBookings: jest.fn(() => Promise.resolve(linked)),
}));

function renderLedger() {
  return render(
    <ThemeProvider theme={theme}>
      <NextIntlClientProvider locale="en" messages={en}>
        <PartyLedger partyId="p1" />
      </NextIntlClientProvider>
    </ThemeProvider>,
  );
}

const chipText = (label: string) => en.expenses.ledger.event_chip.replace('{label}', label);

beforeEach(() => {
  push.mockClear();
  isOwner = true;
  permissions = normalizePermissions({});
});

describe('party ledger event chip', () => {
  it('shows "Event: Priya · Wedding" for a linked entry and opens the booking on tap (owner)', async () => {
    expenses = [expense({ booking_id: 'bk-1', notes: 'Wedding \u00B7 Jul 10, 2026' })];
    linked = { 'bk-1': wedding };
    renderLedger();
    const chip = await screen.findByText(chipText('Priya \u00B7 Wedding'));
    const root = chip.closest('[data-event-chip]')!;
    expect(root).not.toBeNull();
    expect(root.hasAttribute('data-metadata')).toBe(false); // content chip, not MetadataText
    fireEvent.click(root);
    expect(push).toHaveBeenCalledWith('/booking?open=bk-1');
    // Tapping the chip must not open the row's edit dialog.
    expect(screen.queryByText(en.expenses.entry.edit_title)).not.toBeInTheDocument();
  });

  it('no chip on a plain entry (booking_id null)', async () => {
    expenses = [expense({ notes: 'florist' })];
    linked = {};
    renderLedger();
    await screen.findByText('florist');
    expect(document.querySelector('[data-event-chip]')).toBeNull();
  });

  it('without booking.view the chip is shown but inert', async () => {
    isOwner = false;
    permissions = normalizePermissions({ expenses: { view: true } });
    expenses = [expense({ booking_id: 'bk-1' })];
    linked = { 'bk-1': wedding };
    renderLedger();
    const chip = await screen.findByText(chipText('Priya \u00B7 Wedding'));
    fireEvent.click(chip.closest('[data-event-chip]')!);
    expect(push).not.toHaveBeenCalled();
  });

  it('unresolvable booking → first notes segment while the notes keep the default shape', async () => {
    expenses = [expense({ booking_id: 'bk-gone', notes: 'Wedding \u00B7 Jul 10, 2026' })];
    linked = {};
    renderLedger();
    const chip = await screen.findByText(chipText('Wedding'));
    fireEvent.click(chip.closest('[data-event-chip]')!);
    expect(push).not.toHaveBeenCalled(); // nothing to open
    expect(screen.queryByText(/bk-gone/)).not.toBeInTheDocument(); // never a raw id
  });

  it('unresolvable booking + edited notes → chip omitted, no raw id anywhere', async () => {
    expenses = [expense({ booking_id: 'bk-gone', notes: 'paid the florist' })];
    linked = {};
    renderLedger();
    await screen.findByText('paid the florist');
    expect(document.querySelector('[data-event-chip]')).toBeNull();
    expect(screen.queryByText(/bk-gone/)).not.toBeInTheDocument();
  });
});
