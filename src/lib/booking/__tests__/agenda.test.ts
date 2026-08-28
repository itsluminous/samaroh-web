/**
 * Events (full-agenda) view data model:
 * - window cursors: bidirectional paging anchored on today, id-dedup across
 *   page boundaries, exhaustion detection, progress guarantee
 * - grouping by start date + today anchor position
 * - fetchAgendaPage/fetchAgendaRange against the guest Dexie client: windowed
 *   paging walks a large dataset without loading everything at once
 * - day-tap routing (0 / 1 / n bookings × create permission)
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AGENDA_PAGE_SIZE,
  applyAgendaPage,
  fetchAgendaPage,
  fetchAgendaRange,
  groupAgenda,
  initialAgendaWindow,
  todayAnchorIndex,
  type AgendaWindow,
} from '@/lib/booking/agenda';
import { dayTapAction } from '@/lib/booking/calendar';
import type { Booking } from '@/lib/booking/types';
import { makeBooking } from '../../../../test-utils/fixtures';

if (typeof globalThis.crypto?.randomUUID !== 'function') {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

const TODAY = '2026-08-28';

function onDate(iso: string, id?: string): Booking {
  return makeBooking({ start_date: iso, end_date: iso, ...(id ? { id } : {}) });
}

describe('initialAgendaWindow', () => {
  it('anchors future inclusively on today and past strictly before it', () => {
    const w = initialAgendaWindow(TODAY);
    expect(w.bookings).toEqual([]);
    expect(w.future).toEqual({ date: TODAY, inclusive: true, exhausted: false });
    expect(w.past).toEqual({ date: TODAY, inclusive: false, exhausted: false });
  });
});

describe('applyAgendaPage', () => {
  it('merges a future page sorted ascending and advances the cursor inclusively', () => {
    const w0 = initialAgendaWindow(TODAY);
    const page = [onDate('2026-08-28'), onDate('2026-08-30'), onDate('2026-09-02')];
    const w1 = applyAgendaPage(w0, 'future', page, 3);
    expect(w1.bookings.map((b) => b.start_date)).toEqual(['2026-08-28', '2026-08-30', '2026-09-02']);
    // Full page → not exhausted; the boundary date is refetched inclusively next page.
    expect(w1.future).toEqual({ date: '2026-09-02', inclusive: true, exhausted: false });
    expect(w1.past).toEqual(w0.past);
  });

  it('merges a past page (fetched newest-first) into ascending order and flags exhaustion on a short page', () => {
    const w0 = initialAgendaWindow(TODAY);
    const page = [onDate('2026-08-20'), onDate('2026-08-10')];
    const w1 = applyAgendaPage(w0, 'past', page, 3);
    expect(w1.bookings.map((b) => b.start_date)).toEqual(['2026-08-10', '2026-08-20']);
    expect(w1.past.exhausted).toBe(true); // 2 < pageSize 3 — history fully loaded
    expect(w1.past.date).toBe('2026-08-10');
  });

  it('dedupes boundary-date rows that the inclusive cursor refetches', () => {
    const a = onDate('2026-08-30', 'a');
    const b = onDate('2026-08-30', 'b');
    const c = onDate('2026-09-01', 'c');
    let w = applyAgendaPage(initialAgendaWindow(TODAY), 'future', [a, b], 2);
    expect(w.future).toEqual({ date: '2026-08-30', inclusive: true, exhausted: false });
    // Next page re-serves the boundary rows plus one new one.
    w = applyAgendaPage(w, 'future', [a, b, c], 3);
    expect(w.bookings.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('turns the cursor strict when a full page dedupes away entirely (progress guarantee)', () => {
    const a = onDate('2026-08-30', 'a');
    const b = onDate('2026-08-30', 'b');
    let w = applyAgendaPage(initialAgendaWindow(TODAY), 'future', [a, b], 2);
    // Same rows again (a date with more rows than the page size would do this).
    w = applyAgendaPage(w, 'future', [a, b], 2);
    expect(w.future).toEqual({ date: '2026-08-30', inclusive: false, exhausted: false });
    expect(w.bookings).toHaveLength(2);
  });

  it('an empty page only marks exhaustion', () => {
    const w0: AgendaWindow = applyAgendaPage(initialAgendaWindow(TODAY), 'future', [onDate('2026-09-01')], 1);
    const w1 = applyAgendaPage(w0, 'future', [], 1);
    expect(w1.future).toEqual({ date: '2026-09-01', inclusive: true, exhausted: true });
    expect(w1.bookings).toBe(w0.bookings);
  });
});

describe('groupAgenda / todayAnchorIndex', () => {
  it('groups sorted bookings by start date preserving order', () => {
    const rows = [
      onDate('2026-08-10', 'x'),
      onDate('2026-08-10', 'y'),
      onDate('2026-08-28', 'z'),
      onDate('2026-09-05', 'w'),
    ];
    const groups = groupAgenda(rows);
    expect(groups.map((g) => g.date)).toEqual(['2026-08-10', '2026-08-28', '2026-09-05']);
    expect(groups[0]?.bookings.map((b) => b.id)).toEqual(['x', 'y']);
  });

  it('anchors on the first group on/after today; all-past lists anchor past the end', () => {
    const groups = groupAgenda([onDate('2026-08-10'), onDate('2026-08-30')]);
    expect(todayAnchorIndex(groups, TODAY)).toBe(1);
    expect(todayAnchorIndex(groupAgenda([onDate('2026-08-28')]), TODAY)).toBe(0);
    expect(todayAnchorIndex(groupAgenda([onDate('2026-08-01')]), TODAY)).toBe(1);
    expect(todayAnchorIndex([], TODAY)).toBe(0);
  });
});

describe('day-tap routing (0 / 1 / n bookings)', () => {
  it('any bookings on the date — even one — open the chooser regardless of create permission', () => {
    expect(dayTapAction(1, true)).toBe('chooser');
    expect(dayTapAction(1, false)).toBe('chooser');
    expect(dayTapAction(3, true)).toBe('chooser');
    expect(dayTapAction(3, false)).toBe('chooser');
  });

  it('an empty date opens the add form when the member may create, otherwise nothing', () => {
    expect(dayTapAction(0, true)).toBe('add');
    expect(dayTapAction(0, false)).toBe('none');
  });
});

describe('windowed fetching against the guest Dexie client', () => {
  const BIZ = 'biz-agenda';

  async function seedBookings(count: number, startIso: string): Promise<void> {
    const { guestDb } = await import('@/lib/guest/localDb');
    await guestDb.bookings.clear();
    const rows: Record<string, unknown>[] = [];
    const base = new Date(`${startIso}T00:00:00Z`).getTime();
    for (let i = 0; i < count; i++) {
      // Two bookings per date so page boundaries land on ties.
      const d = new Date(base + Math.floor(i / 2) * 86400000).toISOString().slice(0, 10);
      rows.push({
        ...makeBooking({ id: `bk-${String(i).padStart(4, '0')}`, start_date: d, end_date: d, business_id: BIZ }),
      });
    }
    await guestDb.bookings.bulkPut(rows as never[]);
  }

  async function client(): Promise<SupabaseClient> {
    const { createLocalClient } = await import('@/lib/guest/localClient');
    return createLocalClient();
  }

  it('walks 240 bookings in both directions page-by-page without loading everything at once', async () => {
    // 120 days × 2 bookings/day starting 60 days before today.
    await seedBookings(240, '2026-06-29');
    const db = await client();
    let w = initialAgendaWindow(TODAY);

    const firstPast = await fetchAgendaPage(db, BIZ, 'past', w.past);
    const firstFuture = await fetchAgendaPage(db, BIZ, 'future', w.future);
    // Windowed: the first screenful is at most two pages, not all 240 rows.
    expect(firstPast.length).toBeLessThanOrEqual(AGENDA_PAGE_SIZE);
    expect(firstFuture.length).toBeLessThanOrEqual(AGENDA_PAGE_SIZE);
    expect(firstPast.every((b) => b.start_date < TODAY)).toBe(true);
    expect(firstFuture.every((b) => b.start_date >= TODAY)).toBe(true);
    w = applyAgendaPage(w, 'past', firstPast);
    w = applyAgendaPage(w, 'future', firstFuture);

    // Exhaust both directions.
    for (let guard = 0; !w.past.exhausted && guard < 20; guard++) {
      w = applyAgendaPage(w, 'past', await fetchAgendaPage(db, BIZ, 'past', w.past));
    }
    for (let guard = 0; !w.future.exhausted && guard < 20; guard++) {
      w = applyAgendaPage(w, 'future', await fetchAgendaPage(db, BIZ, 'future', w.future));
    }

    expect(w.bookings).toHaveLength(240);
    expect(new Set(w.bookings.map((b) => b.id)).size).toBe(240); // no duplicates
    const dates = w.bookings.map((b) => b.start_date);
    expect([...dates].sort((a, b) => a.localeCompare(b))).toEqual(dates); // ascending
  });

  it('fetchAgendaRange re-reads exactly the loaded date range', async () => {
    await seedBookings(20, '2026-08-20');
    const db = await client();
    const rows = await fetchAgendaRange(db, BIZ, '2026-08-22', '2026-08-24');
    expect(rows).toHaveLength(6); // 3 days × 2
    expect(rows.every((b) => b.start_date >= '2026-08-22' && b.start_date <= '2026-08-24')).toBe(true);
  });
});
