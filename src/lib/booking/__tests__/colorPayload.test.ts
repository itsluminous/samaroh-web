/**
 * bookings.color payload round-trip: create/edit payloads carry the color,
 * reads tolerate a server schema without the column (pre-migration-005),
 * the offline outbox queues it, and guest-mode Dexie persists it.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createBooking, fetchMonthData, updateBooking, type BookingInput } from '../repo';
import type { Booking } from '../types';

// jsdom may not ship crypto.randomUUID — the repo layer generates client UUIDs with it.
if (typeof globalThis.crypto?.randomUUID !== 'function') {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

// ---------- fake remote Supabase client (chainable, thenable) ----------

interface Resp {
  data: unknown;
  error: { message: string } | null;
}

interface Capture {
  inserts: { table: string; row: Record<string, unknown> }[];
  updates: { table: string; patch: Record<string, unknown> }[];
}

function fakeRemote(responses: Record<string, Resp>, capture: Capture): SupabaseClient {
  function chain(table: string) {
    const result = responses[table] ?? { data: [], error: null };
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'is', 'in', 'gte', 'lte', 'gt', 'lt', 'order', 'limit']) {
      b[m] = () => b;
    }
    b.insert = (row: Record<string, unknown>) => {
      capture.inserts.push({ table, row });
      return b;
    };
    b.update = (patch: Record<string, unknown>) => {
      capture.updates.push({ table, patch });
      return b;
    };
    b.then = (
      onfulfilled?: (value: Resp) => unknown,
      onrejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onfulfilled, onrejected);
    return b;
  }
  return { from: (table: string) => chain(table) } as unknown as SupabaseClient;
}

function makeInput(color: string | null): BookingInput {
  return {
    event_type: 'wedding',
    event_icon: '\u{1F492}',
    customer_name: 'Asha Verma',
    customer_phone: null,
    start_date: '2026-08-10',
    end_date: '2026-08-11',
    start_time: null,
    end_time: null,
    total_amount: 50000,
    security_deposit: 0,
    source: null,
    notes: null,
    status: 'confirmed',
    color,
  };
}

const bookingBase: Booking = {
  id: 'b-1',
  business_id: 'biz-1',
  ...makeInput('tomato'),
  invoice_number: null,
  created_by: 'u-1',
  updated_by: null,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  deleted_at: null,
};

describe('create/edit payloads carry bookings.color', () => {
  it('createBooking sends color in the insert row and the optimistic booking', async () => {
    const capture: Capture = { inserts: [], updates: [] };
    const db = fakeRemote({ bookings: { data: null, error: null } }, capture);
    const created = await createBooking(db, 'biz-1', 'u-1', makeInput('sage'), 0);
    expect(capture.inserts).toHaveLength(1);
    expect(capture.inserts[0]?.table).toBe('bookings');
    expect(capture.inserts[0]?.row.color).toBe('sage');
    expect(created.color).toBe('sage');
  });

  it('createBooking with the default option sends color: null', async () => {
    const capture: Capture = { inserts: [], updates: [] };
    const db = fakeRemote({}, capture);
    const created = await createBooking(db, 'biz-1', 'u-1', makeInput(null), 0);
    expect(capture.inserts[0]?.row.color).toBeNull();
    expect(created.color).toBeNull();
  });

  it('updateBooking patch carries the new color (including clearing to null)', async () => {
    const capture: Capture = { inserts: [], updates: [] };
    const db = fakeRemote({}, capture);
    const updated = await updateBooking(db, bookingBase, 'u-1', makeInput(null));
    expect(capture.updates[0]?.patch.color).toBeNull();
    expect(updated.color).toBeNull();

    const recolored = await updateBooking(db, bookingBase, 'u-1', makeInput('grape'));
    expect(capture.updates[1]?.patch.color).toBe('grape');
    expect(recolored.color).toBe('grape');
  });
});

describe('reads tolerate a server schema without bookings.color', () => {
  it('fetchMonthData normalizes a missing color value to null', async () => {
    const legacyRow = { ...bookingBase } as Record<string, unknown>;
    delete legacyRow.color; // pre-migration-005 server: column absent from select *
    const db = fakeRemote(
      {
        bookings: { data: [legacyRow], error: null },
        date_blocks: { data: [], error: null },
        booking_payments: { data: [], error: null },
      },
      { inserts: [], updates: [] },
    );
    const month = await fetchMonthData(db, 'biz-1', '2026-08-01', '2026-08-31');
    expect(month.bookings).toHaveLength(1);
    expect(month.bookings[0]?.color).toBeNull();
  });

  it('fetchMonthData passes a stored color through unchanged', async () => {
    const db = fakeRemote(
      {
        bookings: { data: [{ ...bookingBase, color: 'peacock' }], error: null },
        date_blocks: { data: [], error: null },
        booking_payments: { data: [], error: null },
      },
      { inserts: [], updates: [] },
    );
    const month = await fetchMonthData(db, 'biz-1', '2026-08-01', '2026-08-31');
    expect(month.bookings[0]?.color).toBe('peacock');
  });
});

describe('offline outbox queues the color', () => {
  afterEach(() => {
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  });

  it('createBooking while offline enqueues a payload that includes color', async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    const { listItems } = await import('@/lib/outbox/outbox');
    const { outboxDb } = await import('@/lib/outbox/db');
    await outboxDb.outbox.clear();

    const capture: Capture = { inserts: [], updates: [] };
    const db = fakeRemote({}, capture);
    await createBooking(db, 'biz-1', 'u-1', makeInput('midnight'), 0);

    expect(capture.inserts).toHaveLength(0); // never hit the server
    const items = await listItems();
    expect(items).toHaveLength(1);
    expect(items[0]?.table).toBe('bookings');
    expect(items[0]?.operation).toBe('create');
    expect(items[0]?.payload.color).toBe('midnight');
    await outboxDb.outbox.clear();
  });
});

describe('guest mode (Dexie local client) round-trips the color', () => {
  it('create → read preserves color; a legacy row without the key reads as null', async () => {
    const { createLocalClient } = await import('@/lib/guest/localClient');
    const { guestDb } = await import('@/lib/guest/localDb');
    await guestDb.bookings.clear();

    const db = createLocalClient();
    const created = await createBooking(db, 'biz-1', 'guest', makeInput('fuchsia'), 0);
    expect(created.color).toBe('fuchsia');

    // Simulate a booking created before the color feature (key absent entirely).
    await guestDb.bookings.add({
      ...(bookingBase as unknown as Record<string, unknown> & { id: string }),
      id: 'b-legacy',
    });
    await guestDb.bookings.update('b-legacy', { color: undefined });
    const legacy = await guestDb.bookings.get('b-legacy');
    expect(legacy && 'color' in legacy ? legacy.color : undefined).toBeUndefined();

    const month = await fetchMonthData(db, 'biz-1', '2026-08-01', '2026-08-31');
    const byId = new Map(month.bookings.map((b) => [b.id, b]));
    expect(byId.get(created.id)?.color).toBe('fuchsia');
    expect(byId.get('b-legacy')?.color).toBeNull();
    await guestDb.bookings.clear();
  });
});
