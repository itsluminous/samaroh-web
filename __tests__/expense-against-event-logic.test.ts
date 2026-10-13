/**
 * "Record expense against an event" — contract logic
 * (shared/docs/expense-against-event.md revision 2, migrations 012 + 014):
 * the ENGLISH event party name builder (§2.1), resolution by link → by name
 * → create with business_related=true + booking_id (§2.2; tombstones never
 * match, no back-fill, forbidden without manage_parties → nothing written,
 * 23505 race → re-resolve), both booking_id columns on the write path (incl.
 * the guest-mode local store), the card's Expenses history order/total (§3b).
 */
import 'fake-indexeddb/auto';
import {
  eventPartyCustomerName,
  eventPartyDate,
  eventPartyName,
  eventPartyTypeLabel,
  expensesHistoryTotal,
  matchLinkedParty,
  matchLiveParty,
  newPartyFromBooking,
  PartyCreateForbiddenError,
  sortExpensesNewestFirst,
} from '@/lib/expenses/bookingExpense';
import {
  createExpense,
  createParty,
  fetchBookingExpenses,
  fetchLinkedBookings,
  fetchParties,
  fetchPartyExpenses,
  resolveBookingParty,
} from '@/app/[locale]/(app)/expenses/_lib/queries';
import { createLocalClient } from '@/lib/guest/localClient';
import { guestDb } from '@/lib/guest/localDb';
import { makeBooking } from '../test-utils/fixtures';

describe('event party name (§2.1) — English, deterministic, device-independent', () => {
  it('builds `{EventTypeLabel} - {dd-MMM-yyyy} - {CustomerName}` with " - " separators', () => {
    expect(
      eventPartyName({ event_type: 'wedding', start_date: '2026-10-20', customer_name: 'Sandhya Upadhyay' }),
    ).toBe('Wedding - 20-Oct-2026 - Sandhya Upadhyay');
  });

  it('legacy built-in KEYS resolve to the ENGLISH catalog label; stored labels stay verbatim (Hindi included)', () => {
    expect(eventPartyTypeLabel('wedding')).toBe('Wedding');
    expect(eventPartyTypeLabel('room_booking')).toBe('Room Booking');
    expect(eventPartyTypeLabel('muh_dikhayi')).toBe('Muh Dikhayi');
    expect(eventPartyTypeLabel(' Reception ')).toBe('Reception');
    expect(eventPartyTypeLabel('\u0936\u093E\u0926\u0940')).toBe('\u0936\u093E\u0926\u0940'); // शादी — user data
    expect(eventPartyTypeLabel('Wedding')).toBe('Wedding'); // label snapshot of the seeded preset
    expect(eventPartyTypeLabel('wedding')).not.toMatch(/\u{1F492}/u); // never the emoji
  });

  it('date is two-digit day, English 3-letter month, 4-digit year — never locale digits', () => {
    expect(eventPartyDate('2026-01-05')).toBe('05-Jan-2026');
    expect(eventPartyDate('2026-12-31')).toBe('31-Dec-2026');
    expect(eventPartyDate('2027-09-09')).toBe('09-Sep-2027');
    expect(eventPartyDate('2026-10-20')).not.toMatch(/[\u0966-\u096F]/); // no Devanagari digits
  });

  it('customer name is trimmed with whitespace runs collapsed', () => {
    expect(eventPartyCustomerName('  Sandhya   Upadhyay\t')).toBe('Sandhya Upadhyay');
    expect(
      eventPartyName({ event_type: 'Birthday', start_date: '2026-03-01', customer_name: ' Ramesh  Kumar ' }),
    ).toBe('Birthday - 01-Mar-2026 - Ramesh Kumar');
  });
});

describe('matchLinkedParty / matchLiveParty (§2.2 steps 1–2)', () => {
  const parties = [
    { id: 'a', name: 'Wedding - 20-Oct-2026 - Priya Sharma', created_at: '2026-02-01T00:00:00Z', booking_id: null },
    { id: 'b', name: '  wedding - 20-oct-2026 - priya sharma ', created_at: '2026-01-01T00:00:00Z', booking_id: null },
    { id: 'renamed', name: 'Priya wedding (renamed)', created_at: '2026-03-01T00:00:00Z', booking_id: 'bk-1' },
    { id: 'twin', name: 'Twin', created_at: '2026-02-15T00:00:00Z', booking_id: 'bk-1' },
    { id: 'c', name: 'Ramesh', created_at: '2026-01-05T00:00:00Z' },
  ];

  it('by link: the party whose booking_id matches, whatever its name; earliest created_at among twins', () => {
    expect(matchLinkedParty(parties, 'bk-1')?.id).toBe('twin');
    expect(matchLinkedParty(parties, 'bk-none')).toBeNull();
    expect(matchLinkedParty([], 'bk-1')).toBeNull();
  });

  it('by name: lower(trim(name)) equality, earliest created_at among legacy twins', () => {
    expect(matchLiveParty(parties, 'WEDDING - 20-OCT-2026 - PRIYA SHARMA')?.id).toBe('b');
    expect(matchLiveParty(parties, ' ramesh')?.id).toBe('c');
    expect(matchLiveParty(parties, 'Priya')).toBeNull();
  });
});

describe('newPartyFromBooking (§2.2 step 3)', () => {
  it('uses the English event party name, copies the phone (null when blank), business_related=TRUE, booking_id', () => {
    expect(
      newPartyFromBooking({
        id: 'bk-9',
        event_type: 'wedding',
        start_date: '2026-10-20',
        customer_name: ' Sandhya Upadhyay ',
        customer_phone: ' ',
      }),
    ).toEqual({
      name: 'Wedding - 20-Oct-2026 - Sandhya Upadhyay',
      phone: null,
      businessRelated: true,
      bookingId: 'bk-9',
    });
    expect(
      newPartyFromBooking({
        id: 'bk-9',
        event_type: 'wedding',
        start_date: '2026-10-20',
        customer_name: 'Ramesh',
        customer_phone: '9876543210',
      }).phone,
    ).toBe('9876543210');
  });
});

describe('Expenses history helpers (§3b)', () => {
  const rows = [
    { id: 'old', direction: 'paid' as const, amount: 100, expense_date: '2026-07-01', notes: null, created_at: '2026-07-01T10:00:00Z' },
    { id: 'new-late', direction: 'paid' as const, amount: 300, expense_date: '2026-07-10', notes: null, created_at: '2026-07-10T12:00:00Z' },
    { id: 'new-early', direction: 'received' as const, amount: 50, expense_date: '2026-07-10', notes: null, created_at: '2026-07-10T08:00:00Z' },
  ];

  it('orders newest first: expense_date desc, then created_at desc', () => {
    expect(sortExpensesNewestFirst(rows).map((r) => r.id)).toEqual(['new-late', 'new-early', 'old']);
  });

  it('total = Σ paid − Σ received', () => {
    expect(expensesHistoryTotal(rows)).toBe(350);
    expect(expensesHistoryTotal([])).toBe(0);
  });
});

describe('resolveBookingParty + createExpense against the guest-mode local store', () => {
  const db = createLocalClient();
  const biz = 'biz-1';
  const booking = makeBooking({
    id: 'bk-1',
    event_type: 'wedding',
    start_date: '2026-10-20',
    customer_name: ' Sandhya  Upadhyay ',
    customer_phone: '9876543210',
  });
  const NAME = 'Wedding - 20-Oct-2026 - Sandhya Upadhyay';

  beforeEach(async () => {
    await Promise.all([guestDb.parties.clear(), guestDb.expenses.clear(), guestDb.bookings.clear()]);
  });

  it('step 1 — by link: reuses the live party linked to the booking even after a rename; never a tombstone', async () => {
    await guestDb.parties.bulkAdd([
      { id: 'dead', business_id: biz, name: NAME, phone: null, booking_id: 'bk-1', created_at: '2025-01-01T00:00:00Z', deleted_at: '2025-06-01T00:00:00Z' },
      { id: 'linked', business_id: biz, name: 'Sandhya wedding (renamed)', phone: null, booking_id: 'bk-1', created_at: '2026-01-01T00:00:00Z', deleted_at: null },
      { id: 'byname', business_id: biz, name: NAME, phone: null, booking_id: null, created_at: '2026-02-01T00:00:00Z', deleted_at: null },
    ]);
    const party = await resolveBookingParty(db, biz, booking, false);
    expect(party.id).toBe('linked');
    expect(await guestDb.parties.count()).toBe(3); // nothing created
  });

  it('step 2 — by name: reuses the same-named live party; booking_id and phone are NOT back-filled', async () => {
    await guestDb.parties.bulkAdd([
      { id: 'dead', business_id: biz, name: NAME, phone: null, booking_id: null, created_at: '2025-01-01T00:00:00Z', deleted_at: '2025-06-01T00:00:00Z' },
      { id: 'live', business_id: biz, name: ` ${NAME.toLowerCase()} `, phone: null, booking_id: null, created_at: '2026-01-01T00:00:00Z', deleted_at: null },
    ]);
    const party = await resolveBookingParty(db, biz, booking, false); // no manage_parties needed for a match
    expect(party.id).toBe('live');
    const stored = await guestDb.parties.get('live');
    expect(stored?.phone).toBeNull();
    expect(stored?.booking_id).toBeNull();
    expect(await guestDb.parties.count()).toBe(2);
  });

  it('step 3 — creates the EVENT party (English name, phone, business_related=TRUE, booking_id) with manage_parties', async () => {
    const party = await resolveBookingParty(db, biz, booking, true);
    const stored = await guestDb.parties.get(party.id);
    expect(stored).toMatchObject({
      business_id: biz,
      name: NAME,
      phone: '9876543210',
      business_related: true,
      booking_id: 'bk-1',
    });
    expect(party).toMatchObject({ name: NAME, business_related: true, booking_id: 'bk-1' });
    // Reading it back carries the link (PARTY_COLUMNS include booking_id).
    expect((await fetchParties(db, biz))[0]?.booking_id).toBe('bk-1');
  });

  it('a second save against the same booking reuses the created party (no twin)', async () => {
    const first = await resolveBookingParty(db, biz, booking, true);
    const second = await resolveBookingParty(db, biz, { ...booking, customer_name: 'Sandhya U. (edited)' }, true);
    expect(second.id).toBe(first.id); // by link — the party follows the booking, not the label
    expect(await guestDb.parties.count()).toBe(1);
  });

  it('without manage_parties and no event party: throws party_create_forbidden ({name} = event party name), writes NOTHING', async () => {
    const attempt = resolveBookingParty(db, biz, booking, false);
    await expect(attempt).rejects.toBeInstanceOf(PartyCreateForbiddenError);
    await expect(attempt).rejects.toMatchObject({ partyName: NAME });
    expect(await guestDb.parties.count()).toBe(0);
    expect(await guestDb.expenses.count()).toBe(0);
  });

  it('step 5 — a 23505 on the party insert re-resolves (the other device won the race) instead of failing', async () => {
    const racing = createLocalClient();
    const original = racing.from.bind(racing);
    let raced = false;
    // The first party insert collides (uq_parties_biz_name on the server — the
    // other device's row lands first); the winner is visible on the next pull.
    (racing as unknown as { from: unknown }).from = (table: string) => {
      const builder = original(table) as unknown as { insert: (row: unknown) => Promise<unknown> };
      if (table === 'parties' && !raced) {
        builder.insert = async () => {
          raced = true;
          await guestDb.parties.add({ id: 'winner', business_id: biz, name: NAME, phone: null, booking_id: 'bk-1', created_at: '2026-01-01T00:00:00Z', deleted_at: null });
          return { data: null, error: { message: 'duplicate key value violates unique constraint "uq_parties_biz_name"', code: '23505' } };
        };
      }
      return builder;
    };
    const party = await resolveBookingParty(racing, biz, booking, true);
    expect(party.id).toBe('winner');
    expect(await guestDb.parties.count()).toBe(1);
  });

  it('createParty always puts booking_id on the wire (null for an ordinary party)', async () => {
    await createParty(db, biz, 'Tent House', null, true);
    const raw = await guestDb.parties.toArray();
    expect(raw).toHaveLength(1);
    expect(raw[0]).toMatchObject({ name: 'Tent House', booking_id: null });
  });

  it('createExpense writes booking_id (and null for a plain entry); the ledger read returns it', async () => {
    await guestDb.parties.add({ id: 'p1', business_id: biz, name: 'Ramesh', phone: null, created_at: '2026-01-01T00:00:00Z', deleted_at: null });
    await createExpense(db, biz, 'p1', 'u1', {
      direction: 'paid',
      amount: 500,
      expenseDate: '2026-07-10',
      notes: 'Wedding \u00B7 Jul 10, 2026',
      bookingId: 'bk-1',
    });
    await createExpense(db, biz, 'p1', 'u1', {
      direction: 'received',
      amount: 100,
      expenseDate: '2026-07-11',
      notes: null,
    });
    const rows = await fetchPartyExpenses(db, 'p1');
    const byNotes = Object.fromEntries(rows.map((r) => [r.notes ?? 'plain', r.booking_id]));
    expect(byNotes).toEqual({ 'Wedding \u00B7 Jul 10, 2026': 'bk-1', plain: null });
    const raw = await guestDb.expenses.toArray();
    expect(raw.every((r) => 'booking_id' in r)).toBe(true);
  });

  it('fetchBookingExpenses: live, booking_id-linked rows only, newest first (§3b)', async () => {
    await guestDb.expenses.bulkAdd([
      { id: 'e-old', business_id: biz, party_id: 'p1', direction: 'paid', amount: 100, expense_date: '2026-07-01', notes: 'tent', booking_id: 'bk-1', created_at: '2026-07-01T10:00:00Z', deleted_at: null },
      { id: 'e-new', business_id: biz, party_id: 'p1', direction: 'received', amount: 40, expense_date: '2026-07-12', notes: null, booking_id: 'bk-1', created_at: '2026-07-12T10:00:00Z', deleted_at: null },
      { id: 'e-dead', business_id: biz, party_id: 'p1', direction: 'paid', amount: 999, expense_date: '2026-07-13', notes: null, booking_id: 'bk-1', created_at: '2026-07-13T10:00:00Z', deleted_at: '2026-07-14T00:00:00Z' },
      { id: 'e-plain', business_id: biz, party_id: 'p1', direction: 'paid', amount: 5, expense_date: '2026-07-14', notes: null, booking_id: null, created_at: '2026-07-14T10:00:00Z', deleted_at: null },
      { id: 'e-other', business_id: biz, party_id: 'p1', direction: 'paid', amount: 7, expense_date: '2026-07-14', notes: null, booking_id: 'bk-2', created_at: '2026-07-14T10:00:00Z', deleted_at: null },
    ]);
    expect((await fetchBookingExpenses(db, 'bk-1')).map((r) => r.id)).toEqual(['e-new', 'e-old']);
    expect(await fetchBookingExpenses(db, 'bk-none')).toEqual([]);
  });

  it('fetchLinkedBookings resolves live bookings only and tolerates unknown ids', async () => {
    const live = makeBooking({ id: 'bk-live', customer_name: 'Priya Sharma' });
    const dead = makeBooking({ id: 'bk-dead', deleted_at: '2026-01-01T00:00:00Z' });
    await guestDb.bookings.bulkAdd([live, dead] as never);
    const map = await fetchLinkedBookings(db, ['bk-live', 'bk-dead', 'bk-missing', 'bk-live']);
    expect(Object.keys(map)).toEqual(['bk-live']);
    expect(map['bk-live']?.customer_name).toBe('Priya Sharma');
    expect(await fetchLinkedBookings(db, [])).toEqual({});
  });
});
