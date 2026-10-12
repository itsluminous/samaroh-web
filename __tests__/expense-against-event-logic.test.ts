/**
 * "Record expense against an event" — contract logic
 * (shared/docs/expense-against-event.md §2–§3, migration 012):
 * party resolution (live match by lower(trim(name)), earliest created_at,
 * tombstones never match, create with business_related=false, forbidden
 * without manage_parties → nothing written), the booking_id column on the
 * write path (incl. the guest-mode local store), and the event-chip label
 * + notes fallback.
 */
import 'fake-indexeddb/auto';
import {
  chipLabelFromNotes,
  customerFirstName,
  eventChipLabel,
  matchLiveParty,
  newPartyFromBooking,
  PartyCreateForbiddenError,
} from '@/lib/expenses/bookingExpense';
import {
  createExpense,
  fetchLinkedBookings,
  fetchPartyExpenses,
  resolveBookingParty,
} from '@/app/[locale]/(app)/expenses/_lib/queries';
import { createLocalClient } from '@/lib/guest/localClient';
import { guestDb } from '@/lib/guest/localDb';
import { makeBooking } from '../test-utils/fixtures';

describe('matchLiveParty', () => {
  const parties = [
    { id: 'a', name: 'Priya Sharma', created_at: '2026-02-01T00:00:00Z' },
    { id: 'b', name: '  priya sharma ', created_at: '2026-01-01T00:00:00Z' },
    { id: 'c', name: 'Ramesh', created_at: '2026-01-05T00:00:00Z' },
  ];

  it('matches on lower(trim(name)) and prefers the earliest created_at among twins', () => {
    expect(matchLiveParty(parties, 'PRIYA SHARMA')?.id).toBe('b');
    expect(matchLiveParty(parties, ' ramesh')?.id).toBe('c');
  });

  it('returns null when no live party has that name', () => {
    expect(matchLiveParty(parties, 'Priya')).toBeNull();
    expect(matchLiveParty([], 'Priya Sharma')).toBeNull();
  });
});

describe('newPartyFromBooking', () => {
  it('trims the name, nulls a blank phone and marks the party personal (business_related=false)', () => {
    expect(newPartyFromBooking({ customer_name: ' Priya Sharma ', customer_phone: ' ' })).toEqual({
      name: 'Priya Sharma',
      phone: null,
      businessRelated: false,
    });
    expect(newPartyFromBooking({ customer_name: 'Ramesh', customer_phone: '9876543210' }).phone).toBe(
      '9876543210',
    );
  });
});

describe('event chip label', () => {
  it('is "{firstName} · {eventType}" (pillLabel first-name convention)', () => {
    expect(customerFirstName('  Priya   Sharma ')).toBe('Priya');
    expect(eventChipLabel({ customer_name: 'Priya Sharma' }, 'Wedding')).toBe('Priya \u00B7 Wedding');
  });

  it('falls back to the first notes segment only while the notes keep the default shape', () => {
    expect(chipLabelFromNotes('Wedding \u00B7 Jul 10, 2026')).toBe('Wedding');
    expect(chipLabelFromNotes('Wedding \u00B7 Jul 10 \u00B7 extra')).toBe('Wedding');
    expect(chipLabelFromNotes('paid the florist')).toBeNull();
    expect(chipLabelFromNotes(' \u00B7 dates')).toBeNull();
    expect(chipLabelFromNotes(null)).toBeNull();
  });
});

describe('resolveBookingParty + createExpense against the guest-mode local store', () => {
  const db = createLocalClient();
  const biz = 'biz-1';

  beforeEach(async () => {
    await Promise.all([guestDb.parties.clear(), guestDb.expenses.clear(), guestDb.bookings.clear()]);
  });

  it('reuses the live party with the same normalised name — never a tombstoned one, never back-fills phone', async () => {
    await guestDb.parties.bulkAdd([
      { id: 'dead', business_id: biz, name: 'Priya Sharma', phone: null, created_at: '2025-01-01T00:00:00Z', deleted_at: '2025-06-01T00:00:00Z' },
      { id: 'live', business_id: biz, name: 'priya sharma', phone: null, created_at: '2026-01-01T00:00:00Z', deleted_at: null },
    ]);
    const party = await resolveBookingParty(
      db,
      biz,
      { customer_name: ' Priya Sharma', customer_phone: '9876543210' },
      false, // no manage_parties needed for a match
    );
    expect(party.id).toBe('live');
    const stored = await guestDb.parties.get('live');
    expect(stored?.phone).toBeNull(); // not back-filled
    expect(await guestDb.parties.count()).toBe(2); // nothing created
  });

  it('creates the party (business_related=false, phone copied) when none is live and manage_parties is held', async () => {
    const party = await resolveBookingParty(
      db,
      biz,
      { customer_name: ' Ramesh Kumar ', customer_phone: '9876543210' },
      true,
    );
    const stored = await guestDb.parties.get(party.id);
    expect(stored).toMatchObject({
      business_id: biz,
      name: 'Ramesh Kumar',
      phone: '9876543210',
      business_related: false,
    });
  });

  it('without manage_parties and no live party: throws party_create_forbidden and writes NOTHING', async () => {
    await expect(
      resolveBookingParty(db, biz, { customer_name: 'Ramesh Kumar', customer_phone: null }, false),
    ).rejects.toBeInstanceOf(PartyCreateForbiddenError);
    expect(await guestDb.parties.count()).toBe(0);
    expect(await guestDb.expenses.count()).toBe(0);
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
    // Raw rows carry the column explicitly (null on the wire for plain entries).
    const raw = await guestDb.expenses.toArray();
    expect(raw.every((r) => 'booking_id' in r)).toBe(true);
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
