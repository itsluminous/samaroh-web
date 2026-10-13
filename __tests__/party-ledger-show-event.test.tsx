/**
 * Party-ledger "Show event" (shared/docs/expense-against-event.md rev 2 §3):
 * an entry with booking_id shows the `expenses.ledger.show_event` action chip
 * (content, not MetadataText); the ledger header of an EVENT party
 * (parties.booking_id) shows it once next to the name; tap opens that
 * booking's detail on the Booking page (`/booking?open=<id>`). Gated by
 * booking.view — without it the control is NOT rendered; an unresolvable
 * booking omits it; a raw id is never shown; the retired
 * `expenses.ledger.event_chip` text no longer appears.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { NextIntlClientProvider } from 'next-intl';
import theme from '@/theme/theme';
import en from '../messages/en.json';
import PartyLedger from '@/app/[locale]/(app)/expenses/_components/PartyLedger';
import type { ExpenseRecord, LinkedBooking, PartyRecord } from '@/app/[locale]/(app)/expenses/_lib/queries';
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

const plainParty: PartyRecord = {
  id: 'p1',
  name: 'Tent House',
  phone: null,
  business_related: true,
  booking_id: null,
  created_at: '2026-01-01T00:00:00Z',
};
const eventParty: PartyRecord = { ...plainParty, name: 'Wedding - 10-Jul-2026 - Priya Sharma', booking_id: 'bk-1' };

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

let party: PartyRecord = plainParty;
let expenses: ExpenseRecord[] = [];
let linked: Record<string, LinkedBooking> = {};
const fetchLinkedBookings = jest.fn(() => Promise.resolve(linked));

jest.mock('@/app/[locale]/(app)/expenses/_lib/queries', () => ({
  ...jest.requireActual('@/app/[locale]/(app)/expenses/_lib/queries'),
  fetchParty: jest.fn(() => Promise.resolve(party)),
  fetchPartyExpenses: jest.fn(() => Promise.resolve(expenses)),
  fetchLinkedBookings: (...args: unknown[]) => fetchLinkedBookings(...(args as [])),
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

const showEvent = en.expenses.ledger.show_event;
const retiredChipPrefix = en.expenses.ledger.event_chip.split('{label}')[0]!.trim(); // "Event:"

beforeEach(() => {
  push.mockClear();
  fetchLinkedBookings.mockClear();
  isOwner = true;
  permissions = normalizePermissions({});
  party = plainParty;
});

describe('party ledger — "Show event"', () => {
  it('linked entry: shows the action chip and opens the booking on tap (owner); the retired event_chip is gone', async () => {
    expenses = [expense({ booking_id: 'bk-1', notes: 'Wedding \u00B7 Jul 10, 2026' })];
    linked = { 'bk-1': wedding };
    renderLedger();
    const chip = await screen.findByTestId('entry-show-event');
    expect(chip).toHaveTextContent(showEvent);
    expect(chip.hasAttribute('data-metadata')).toBe(false); // an action, not MetadataText
    expect(screen.queryByText(new RegExp(`^${retiredChipPrefix}`))).not.toBeInTheDocument();
    fireEvent.click(chip);
    expect(push).toHaveBeenCalledWith('/booking?open=bk-1');
    // Tapping the chip must not open the row's edit dialog.
    expect(screen.queryByText(en.expenses.entry.edit_title)).not.toBeInTheDocument();
    // No header control on an ordinary party.
    expect(screen.queryByTestId('party-show-event')).not.toBeInTheDocument();
  });

  it('plain entry (booking_id null): no control', async () => {
    expenses = [expense({ notes: 'florist' })];
    linked = {};
    renderLedger();
    await screen.findByText('florist');
    expect(document.querySelector('[data-show-event]')).toBeNull();
  });

  it('without booking.view the control is NOT rendered (hidden, never inert)', async () => {
    isOwner = false;
    permissions = normalizePermissions({ expenses: { view: true } });
    party = eventParty;
    expenses = [expense({ booking_id: 'bk-1' })];
    linked = { 'bk-1': wedding };
    renderLedger();
    await screen.findByText(eventParty.name);
    expect(screen.queryByText(showEvent)).not.toBeInTheDocument();
    expect(document.querySelector('[data-show-event]')).toBeNull();
  });

  it('event party header: "Show event" once next to the name, resolving the PARTY link too', async () => {
    party = eventParty;
    expenses = [expense({ booking_id: null, notes: 'plain ledger entry' })];
    linked = { 'bk-1': wedding };
    renderLedger();
    const header = await screen.findByTestId('party-show-event');
    expect(screen.getAllByText(showEvent)).toHaveLength(1);
    // The party's own booking_id was included in the lookup.
    expect(fetchLinkedBookings).toHaveBeenCalledWith(expect.anything(), ['bk-1']);
    fireEvent.click(header);
    expect(push).toHaveBeenCalledWith('/booking?open=bk-1');
  });

  it('unresolvable booking (tombstoned / not pulled) → control omitted, no raw id anywhere', async () => {
    party = { ...eventParty, booking_id: 'bk-gone' };
    expenses = [expense({ booking_id: 'bk-gone', notes: 'Wedding \u00B7 Jul 10, 2026' })];
    linked = {};
    renderLedger();
    await screen.findByText('Wedding \u00B7 Jul 10, 2026');
    expect(document.querySelector('[data-show-event]')).toBeNull();
    expect(screen.queryByText(/bk-gone/)).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('amounts stay masked without expenses.view_amounts even on linked rows', async () => {
    isOwner = false;
    permissions = normalizePermissions({ booking: { view: true }, expenses: { view: true, view_amounts: false } });
    expenses = [expense({ booking_id: 'bk-1', amount: 500 })];
    linked = { 'bk-1': wedding };
    renderLedger();
    await screen.findByTestId('entry-show-event');
    expect(screen.queryByText(/500/)).not.toBeInTheDocument();
  });
});
