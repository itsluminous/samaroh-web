/**
 * event_types presets data layer (shared migration 006):
 * - CRUD round-trip through the outbox layer against the guest Dexie client
 * - seeding: guest business bootstrap + best-effort server seeding
 * - snapshot semantics: renaming/deleting a preset never rewrites bookings
 * - duplicate-name validation and reorder persistence
 * - reads tolerate a pre-006 server (fetch returns null → static fallback)
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import en from '../../../../messages/en.json';
import {
  buildEventTypeSeedRows,
  createEventType,
  deleteEventType,
  fallbackPresets,
  fetchEventTypes,
  findPresetForType,
  isDuplicateLabel,
  reorderEventTypes,
  seedEventTypes,
  updateEventType,
  type EventTypePreset,
} from '../eventTypePresets';
import { eventTypeDefaultColor } from '../bookingColors';
import { createBooking, type BookingInput } from '../repo';

// jsdom may not ship crypto.randomUUID — the data layer generates client UUIDs with it.
if (typeof globalThis.crypto?.randomUUID !== 'function') {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

/** Resolves a flat catalog key against the generated en messages tree. */
function translate(key: string): string {
  const value = key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en);
  return typeof value === 'string' ? value : key;
}

const BIZ = 'biz-1';

async function freshDb(): Promise<SupabaseClient> {
  const { createLocalClient } = await import('@/lib/guest/localClient');
  const { guestDb } = await import('@/lib/guest/localDb');
  await guestDb.event_types.clear();
  await guestDb.bookings.clear();
  return createLocalClient();
}

describe('seeding from the shared template', () => {
  it('buildEventTypeSeedRows produces the 9 built-ins with localized labels and sort_order 0..8', () => {
    const rows = buildEventTypeSeedRows(BIZ, translate);
    expect(rows).toHaveLength(9);
    expect(rows.map((r) => r.sort_order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(rows[0]).toMatchObject({ business_id: BIZ, label: 'Engagement', icon: '\u{1F48D}', color: 'flamingo' });
    expect(rows[2]).toMatchObject({ label: 'Wedding', color: 'tomato' });
    expect(rows[6]).toMatchObject({ label: 'Custom', color: 'grape' });
    expect(rows[7]).toMatchObject({ label: 'Lagan', color: 'peacock' });
    expect(rows[8]).toMatchObject({ label: 'Muh Dikhayi', color: 'fuchsia' });
    // Client UUIDs — replay-idempotent inserts.
    for (const r of rows) {
      expect(String(r.id)).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it('seedEventTypes inserts the rows and fetchEventTypes reads them back in order', async () => {
    const db = await freshDb();
    expect(await seedEventTypes(db, BIZ, translate)).toBe(true);
    const presets = await fetchEventTypes(db, BIZ);
    expect(presets).toHaveLength(9);
    expect(presets?.map((p) => p.label)).toEqual([
      'Engagement', 'Tilak', 'Wedding', 'Room Booking', 'Birthday', 'Anniversary', 'Custom', 'Lagan', 'Muh Dikhayi',
    ]);
  });

  it('seedEventTypes is best-effort: a pre-006 server error resolves false, never throws', async () => {
    const failing = {
      from: () => ({
        insert: async () => ({ error: { message: 'relation "event_types" does not exist' } }),
      }),
    } as unknown as SupabaseClient;
    await expect(seedEventTypes(failing, BIZ, translate)).resolves.toBe(false);
  });

  it('seedGuestBusiness bootstraps the presets alongside the guest business', async () => {
    const { guestDb } = await import('@/lib/guest/localDb');
    const { seedGuestBusiness } = await import('@/lib/guest/seed');
    const { GUEST_BUSINESS_ID } = await import('@/lib/guest/guest');
    await guestDb.businesses.clear();
    await guestDb.business_members.clear();
    await guestDb.event_types.clear();

    await seedGuestBusiness(
      { name: 'Hall', businessType: 'Marriage hall', address: null, ownerName: 'Asha' },
      translate,
    );
    const rows = await guestDb.event_types.toArray();
    expect(rows).toHaveLength(9);
    expect(rows.every((r) => r.business_id === GUEST_BUSINESS_ID)).toBe(true);
    expect(rows.every((r) => r.deleted_at === null)).toBe(true);

    // Idempotent: re-entering guest mode never duplicates the presets.
    await seedGuestBusiness(
      { name: 'Hall', businessType: 'Marriage hall', address: null, ownerName: 'Asha' },
      translate,
    );
    expect(await guestDb.event_types.count()).toBe(9);
  });
});

describe('CRUD round-trip on the guest Dexie client', () => {
  it('create → fetch → update → soft delete', async () => {
    const db = await freshDb();
    const created = await createEventType(db, BIZ, { label: 'Mehndi', icon: '\u{1F58C}\uFE0F', color: 'fuchsia' }, 0);

    let presets = (await fetchEventTypes(db, BIZ)) ?? [];
    expect(presets).toHaveLength(1);
    expect(presets[0]).toMatchObject({ id: created.id, label: 'Mehndi', icon: '\u{1F58C}\uFE0F', color: 'fuchsia', sort_order: 0 });

    const updated = await updateEventType(db, presets[0] as EventTypePreset, {
      label: 'Mehndi Night',
      icon: '\u{1F33F}',
      color: null,
    });
    presets = (await fetchEventTypes(db, BIZ)) ?? [];
    expect(presets[0]).toMatchObject({ id: updated.id, label: 'Mehndi Night', icon: '\u{1F33F}', color: null });

    await deleteEventType(db, presets[0] as EventTypePreset);
    presets = (await fetchEventTypes(db, BIZ)) ?? [];
    expect(presets).toHaveLength(0);

    // Soft delete: the tombstoned row still exists in the store.
    const { guestDb } = await import('@/lib/guest/localDb');
    const raw = await guestDb.event_types.get(created.id);
    expect(raw?.deleted_at).not.toBeNull();
  });

  it('fetch excludes other businesses and orders by sort_order', async () => {
    const db = await freshDb();
    await createEventType(db, BIZ, { label: 'B', icon: 'b', color: null }, 1);
    await createEventType(db, BIZ, { label: 'A', icon: 'a', color: null }, 0);
    await createEventType(db, 'biz-other', { label: 'X', icon: 'x', color: null }, 0);
    const presets = await fetchEventTypes(db, BIZ);
    expect(presets?.map((p) => p.label)).toEqual(['A', 'B']);
  });

  it('reorderEventTypes renumbers to the new positions and persists', async () => {
    const db = await freshDb();
    await seedEventTypes(db, BIZ, translate);
    const presets = (await fetchEventTypes(db, BIZ)) ?? [];
    // Move Wedding (index 2) to the top.
    const reordered = [presets[2], presets[0], presets[1], ...presets.slice(3)] as EventTypePreset[];
    await reorderEventTypes(db, reordered);
    const after = (await fetchEventTypes(db, BIZ)) ?? [];
    expect(after.map((p) => p.label)).toEqual([
      'Wedding', 'Engagement', 'Tilak', 'Room Booking', 'Birthday', 'Anniversary', 'Custom', 'Lagan', 'Muh Dikhayi',
    ]);
    expect(after.map((p) => p.sort_order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('offline outbox queues preset writes', () => {
  afterEach(() => {
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  });

  it('createEventType while offline enqueues instead of hitting the server', async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    const { listItems } = await import('@/lib/outbox/outbox');
    const { outboxDb } = await import('@/lib/outbox/db');
    await outboxDb.outbox.clear();

    const inserts: unknown[] = [];
    const remote = {
      from: () => ({
        insert: async (row: unknown) => {
          inserts.push(row);
          return { error: null };
        },
      }),
    } as unknown as SupabaseClient;

    await createEventType(remote, BIZ, { label: 'Haldi', icon: '\u{1F49B}', color: 'banana' }, 7);
    expect(inserts).toHaveLength(0);
    const items = await listItems();
    expect(items).toHaveLength(1);
    expect(items[0]?.table).toBe('event_types');
    expect(items[0]?.operation).toBe('create');
    expect(items[0]?.payload.label).toBe('Haldi');
    await outboxDb.outbox.clear();
  });
});

describe('snapshot semantics: bookings keep their recorded label/icon', () => {
  function bookingInput(label: string, icon: string): BookingInput {
    return {
      event_type: label,
      event_icon: icon,
      customer_name: 'Asha Verma',
      customer_phone: null,
      start_date: '2026-09-10',
      end_date: '2026-09-10',
      start_time: null,
      end_time: null,
      total_amount: 50000,
      security_deposit: 0,
      source: null,
      notes: null,
      status: 'confirmed',
      color: null,
    };
  }

  it('renaming a preset does not rewrite existing bookings; colour follows the live presets', async () => {
    const db = await freshDb();
    await seedEventTypes(db, BIZ, translate);
    let presets = (await fetchEventTypes(db, BIZ)) ?? [];
    const wedding = presets.find((p) => p.label === 'Wedding') as EventTypePreset;

    // Booking snapshots the preset's label + icon at save time.
    const booking = await createBooking(db, BIZ, 'guest', bookingInput(wedding.label, wedding.icon), 0);
    expect(eventTypeDefaultColor(booking.event_type, presets)?.key).toBe('tomato');

    // Rename the preset — the booking row must stay untouched.
    await updateEventType(db, wedding, { label: 'Shaadi', icon: wedding.icon, color: wedding.color });
    const { guestDb } = await import('@/lib/guest/localDb');
    const stored = await guestDb.bookings.get(booking.id);
    expect(stored?.event_type).toBe('Wedding');
    expect(stored?.event_icon).toBe('\u{1F492}');

    // The old label no longer matches a live preset → themed default colour;
    // the new label picks up the preset's colour.
    presets = (await fetchEventTypes(db, BIZ)) ?? [];
    expect(eventTypeDefaultColor('Wedding', presets)).toBeUndefined();
    expect(eventTypeDefaultColor('Shaadi', presets)?.key).toBe('tomato');
  });

  it('deleting a preset leaves bookings intact too', async () => {
    const db = await freshDb();
    await seedEventTypes(db, BIZ, translate);
    const presets = (await fetchEventTypes(db, BIZ)) ?? [];
    const birthday = presets.find((p) => p.label === 'Birthday') as EventTypePreset;
    const booking = await createBooking(db, BIZ, 'guest', bookingInput(birthday.label, birthday.icon), 0);

    await deleteEventType(db, birthday);
    const { guestDb } = await import('@/lib/guest/localDb');
    const stored = await guestDb.bookings.get(booking.id);
    expect(stored?.event_type).toBe('Birthday');
    expect(stored?.event_icon).toBe('\u{1F382}');
  });
});

describe('duplicate-name validation', () => {
  const presets = [
    { id: 'p1', label: 'Wedding' },
    { id: 'p2', label: 'Room Booking' },
  ] as EventTypePreset[];

  it('flags exact, case-insensitive and padded matches', () => {
    expect(isDuplicateLabel(presets, 'Wedding')).toBe(true);
    expect(isDuplicateLabel(presets, 'wedding')).toBe(true);
    expect(isDuplicateLabel(presets, '  Wedding  ')).toBe(true);
    expect(isDuplicateLabel(presets, 'room booking')).toBe(true);
  });

  it('allows new names, empty input, and the preset being edited itself', () => {
    expect(isDuplicateLabel(presets, 'Mehndi')).toBe(false);
    expect(isDuplicateLabel(presets, '')).toBe(false);
    expect(isDuplicateLabel(presets, '   ')).toBe(false);
    expect(isDuplicateLabel(presets, 'Wedding', 'p1')).toBe(false);
    expect(isDuplicateLabel(presets, 'Wedding', 'p2')).toBe(true);
  });
});

describe('reads tolerate a pre-006 server (schema lag)', () => {
  it('fetchEventTypes returns null when the table is missing', async () => {
    const failing = {
      from: () => {
        const b: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'is', 'order']) {
          b[m] = () => b;
        }
        b.then = (resolve?: (v: unknown) => unknown) =>
          Promise.resolve({ data: null, error: { message: 'relation "event_types" does not exist' } }).then(resolve);
        return b;
      },
    } as unknown as SupabaseClient;
    expect(await fetchEventTypes(failing, BIZ)).toBeNull();
  });

  it('fallbackPresets renders the static template without the custom entry', () => {
    const fallback = fallbackPresets(translate);
    expect(fallback.map((p) => p.label)).toEqual([
      'Engagement', 'Tilak', 'Wedding', 'Room Booking', 'Birthday', 'Anniversary', 'Lagan', 'Muh Dikhayi',
    ]);
    expect(fallback.find((p) => p.label === 'Wedding')?.color).toBe('tomato');
  });
});

describe('findPresetForType (label snapshot + legacy key bridging)', () => {
  const presets = [
    { id: 'p1', label: 'Wedding' },
    { id: 'p2', label: 'Room Booking' },
  ] as EventTypePreset[];

  it('matches the exact stored label and case-insensitive variants', () => {
    expect(findPresetForType(presets, 'Wedding')?.id).toBe('p1');
    expect(findPresetForType(presets, 'wedding')?.id).toBe('p1');
  });

  it('bridges legacy built-in KEYS to seeded labels', () => {
    expect(findPresetForType(presets, 'room_booking')?.id).toBe('p2');
  });

  it('returns undefined for unknown labels and blanks', () => {
    expect(findPresetForType(presets, 'Sangeet')).toBeUndefined();
    expect(findPresetForType(presets, '')).toBeUndefined();
  });
});
