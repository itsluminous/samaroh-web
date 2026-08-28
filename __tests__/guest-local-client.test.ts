/**
 * Guest-mode local client: verifies the Dexie-backed PostgREST-subset builder
 * behaves like the real client for the query shapes the app uses — CRUD,
 * filters, ordering, single/maybeSingle, duplicate-key code, update-returning
 * and the nested expense_attachments select — plus the business seeding.
 */
import 'fake-indexeddb/auto';
import { GUEST_BUSINESS_ID, GUEST_USER_ID } from '@/lib/guest/guest';
import { createLocalClient, isLocalClient } from '@/lib/guest/localClient';
import { guestDb } from '@/lib/guest/localDb';
import { hasGuestBusiness, seedGuestBusiness } from '@/lib/guest/seed';

const client = createLocalClient();

beforeEach(async () => {
  await Promise.all(guestDb.tables.map((t) => t.clear()));
});

describe('guest local client', () => {
  it('is detectable so the outbox never queues local writes', () => {
    expect(isLocalClient(client)).toBe(true);
    expect(isLocalClient(null)).toBe(false);
  });

  it('inserts and selects with filters, order and limit', async () => {
    await client.from('parties').insert([
      { id: 'p1', business_id: 'b1', name: 'Zara', phone: null },
      { id: 'p2', business_id: 'b1', name: 'Amit', phone: '99' },
      { id: 'p3', business_id: 'b2', name: 'Ravi', phone: null },
    ]);
    const { data, error } = await client
      .from('parties')
      .select('id, name, phone, created_at')
      .eq('business_id', 'b1')
      .is('deleted_at', null)
      .order('name', { ascending: true });
    expect(error).toBeNull();
    expect((data as { name: string }[]).map((r) => r.name)).toEqual(['Amit', 'Zara']);

    const limited = await client.from('parties').select('id').eq('business_id', 'b1').limit(1);
    expect((limited.data as unknown[]).length).toBe(1);
  });

  it('returns 23505 on duplicate id (outbox replay idempotency contract)', async () => {
    await client.from('bookings').insert({ id: 'bk1', business_id: 'b1', customer_name: 'A' });
    const { error } = await client
      .from('bookings')
      .insert({ id: 'bk1', business_id: 'b1', customer_name: 'A' });
    expect(error?.code).toBe('23505');
  });

  it('updates via filters and supports update-returning select', async () => {
    await client.from('businesses').insert({ id: 'b1', name: 'Hall', invoice_counter: 0 });
    const bumped = await client
      .from('businesses')
      .update({ invoice_counter: 1 })
      .eq('id', 'b1')
      .eq('invoice_counter', 0)
      .select('id');
    expect(bumped.error).toBeNull();
    expect((bumped.data as unknown[]).length).toBe(1);

    // Optimistic-concurrency miss: stale counter matches no rows.
    const missed = await client
      .from('businesses')
      .update({ invoice_counter: 2 })
      .eq('id', 'b1')
      .eq('invoice_counter', 0)
      .select('id');
    expect((missed.data as unknown[]).length).toBe(0);
  });

  it('supports single and maybeSingle semantics', async () => {
    await client.from('bookings').insert({ id: 'bk1', business_id: 'b1', invoice_number: null });
    const one = await client.from('bookings').select('invoice_number').eq('id', 'bk1').single();
    expect(one.error).toBeNull();
    expect((one.data as { invoice_number: unknown }).invoice_number).toBeNull();

    const none = await client.from('bookings').select('id').eq('id', 'missing').maybeSingle();
    expect(none.error).toBeNull();
    expect(none.data).toBeNull();

    const singleMiss = await client.from('bookings').select('id').eq('id', 'missing').single();
    expect(singleMiss.error?.code).toBe('PGRST116');
  });

  it('soft-delete tombstones stay filterable and date ranges work', async () => {
    await client.from('bookings').insert([
      { id: 'bk1', business_id: 'b1', start_date: '2026-08-05', end_date: '2026-08-05' },
      { id: 'bk2', business_id: 'b1', start_date: '2026-09-10', end_date: '2026-09-11' },
    ]);
    await client
      .from('bookings')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', 'bk1');
    const { data } = await client
      .from('bookings')
      .select('id')
      .eq('business_id', 'b1')
      .is('deleted_at', null)
      .lte('start_date', '2026-09-30')
      .gte('end_date', '2026-09-01');
    expect((data as { id: string }[]).map((r) => r.id)).toEqual(['bk2']);
  });

  it('resolves the nested expense_attachments select', async () => {
    await client.from('expenses').insert({ id: 'e1', party_id: 'p1', amount: 100 });
    await client.from('expense_attachments').insert({
      id: 'a1',
      expense_id: 'e1',
      business_id: 'b1',
      drive_file_id: null,
      mime_type: 'image/png',
      file_name: 'bill.png',
    });
    const { data } = await client
      .from('expenses')
      .select(
        'id, party_id, amount, expense_attachments(id, expense_id, drive_file_id, mime_type, file_name, deleted_at)',
      )
      .eq('party_id', 'p1');
    const rows = data as { expense_attachments: { file_name: string }[] }[];
    expect(rows[0]?.expense_attachments).toHaveLength(1);
    expect(rows[0]?.expense_attachments[0]?.file_name).toBe('bill.png');
  });

  it('rpc errors so callers use their client-side fallback', async () => {
    const { error } = await client.rpc('get_current_inventory', { p_business_id: 'b1' });
    expect(error).not.toBeNull();
  });

  it('seeds the guest business with an owner membership, idempotently', async () => {
    expect(await hasGuestBusiness()).toBe(false);
    await seedGuestBusiness(
      { name: 'Test Hall', businessType: 'Marriage Hall', address: null, ownerName: 'Owner' },
      (key) => key,
    );
    await seedGuestBusiness(
      { name: 'Other Name', businessType: 'Marriage Hall', address: null, ownerName: 'Owner' },
      (key) => key,
    );
    expect(await hasGuestBusiness()).toBe(true);

    const { data: user } = await client.auth.getUser();
    expect(user.user?.id).toBe(GUEST_USER_ID);

    const { data } = await client
      .from('businesses')
      .select('id, name, owner_user_id')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1);
    const biz = (data as { id: string; name: string; owner_user_id: string }[])[0];
    expect(biz?.id).toBe(GUEST_BUSINESS_ID);
    expect(biz?.name).toBe('Test Hall'); // second seed did not overwrite
    expect(biz?.owner_user_id).toBe(GUEST_USER_ID);

    const members = await client
      .from('business_members')
      .select('user_id, display_name, is_owner, permissions')
      .eq('business_id', GUEST_BUSINESS_ID)
      .is('deleted_at', null);
    expect((members.data as { is_owner: boolean }[])[0]?.is_owner).toBe(true);
  });
});
