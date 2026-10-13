/**
 * "Record expense against an event" — the booking screen's view of the
 * expenses permissions and the event-chip deep link
 * (shared/docs/expense-against-event.md §1 + §3):
 *   - `fetchBusinessContext().expensePermissions` = `expenses.create` /
 *     `expenses.manage_parties` from the member's blob (absent = false),
 *     owners always true — the Record expense gate and the party-create rule;
 *   - `fetchBookingById` resolves LIVE bookings only (tombstoned / unknown →
 *     null, never a throw) so `?open=<id>` degrades to the plain calendar.
 * Runs against the guest-mode local store (the same client surface as
 * PostgREST).
 */
import 'fake-indexeddb/auto';
import { fetchBookingById, fetchBusinessContext } from '@/lib/booking/repo';
import { GUEST_USER_ID } from '@/lib/guest/guest';
import { createLocalClient } from '@/lib/guest/localClient';
import { guestDb } from '@/lib/guest/localDb';
import { makeBooking } from '../test-utils/fixtures';

const db = createLocalClient();

function business(ownerUserId: string) {
  return {
    id: 'biz-1',
    name: 'Four Season Hall',
    business_type: 'Marriage Hall',
    address: null,
    owner_name: 'Owner',
    logo_path: null,
    invoice_prefix: 'INV',
    invoice_counter: 0,
    owner_user_id: ownerUserId,
    created_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
  };
}

function member(permissions: Record<string, unknown> | null) {
  return {
    id: 'member-guest',
    business_id: 'biz-1',
    user_id: GUEST_USER_ID,
    display_name: 'Guest Member',
    is_owner: false,
    permissions,
    deleted_at: null,
  };
}

beforeEach(async () => {
  await Promise.all([guestDb.businesses.clear(), guestDb.business_members.clear(), guestDb.bookings.clear()]);
});

describe('fetchBusinessContext().expensePermissions', () => {
  it('owner: create + manage_parties are always true (no member row needed)', async () => {
    await guestDb.businesses.add(business(GUEST_USER_ID));
    const ctx = await fetchBusinessContext(db);
    expect(ctx?.isOwner).toBe(true);
    expect(ctx?.expensePermissions).toEqual({ view: true, view_amounts: true, create: true, manage_parties: true });
  });

  it('member with expenses.create only: the action shows, party creation is forbidden', async () => {
    await guestDb.businesses.add(business('owner-user'));
    await guestDb.business_members.add(
      member({ booking: { view: true }, expenses: { view: true, create: true } }),
    );
    const ctx = await fetchBusinessContext(db);
    expect(ctx?.isOwner).toBe(false);
    expect(ctx?.expensePermissions).toEqual({ view: true, view_amounts: true, create: true, manage_parties: false });
  });

  it('member with create + manage_parties: both true', async () => {
    await guestDb.businesses.add(business('owner-user'));
    await guestDb.business_members.add(
      member({ booking: { view: true }, expenses: { create: true, manage_parties: true, view_amounts: false } }),
    );
    const ctx = await fetchBusinessContext(db);
    // view absent = false (section hidden); view_amounts explicit false = masked.
    expect(ctx?.expensePermissions).toEqual({ view: false, view_amounts: false, create: true, manage_parties: true });
  });

  it('member without an expenses blob (or with a stale `add` key): absent = false — the action is hidden', async () => {
    await guestDb.businesses.add(business('owner-user'));
    await guestDb.business_members.add(member({ booking: { view: true }, expenses: { add: true } }));
    const ctx = await fetchBusinessContext(db);
    expect(ctx?.expensePermissions).toEqual({ view: false, view_amounts: true, create: false, manage_parties: false });

    await guestDb.business_members.clear();
    await guestDb.business_members.add(member(null));
    const bare = await fetchBusinessContext(db);
    expect(bare?.expensePermissions).toEqual({ view: false, view_amounts: true, create: false, manage_parties: false });
  });
});

describe('fetchBookingById ("Show event" deep link)', () => {
  it('returns the live booking (colour normalised to null when absent)', async () => {
    const row: Record<string, unknown> = { ...makeBooking({ id: 'bk-live' }) };
    delete row.color; // pre-005 row shape
    await guestDb.bookings.add(row as never);
    const booking = await fetchBookingById(db, 'bk-live');
    expect(booking?.id).toBe('bk-live');
    expect(booking?.color).toBeNull();
  });

  it('tombstoned or unknown id → null (never throws, never a bare id)', async () => {
    await guestDb.bookings.add(makeBooking({ id: 'bk-dead', deleted_at: '2026-06-01T00:00:00Z' }) as never);
    await expect(fetchBookingById(db, 'bk-dead')).resolves.toBeNull();
    await expect(fetchBookingById(db, 'bk-missing')).resolves.toBeNull();
  });
});
