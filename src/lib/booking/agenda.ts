// Events (full-agenda) view data model: windowed, bidirectional fetching of
// ALL of a business's bookings around today, grouped by start date. The
// window grows page-by-page as the user scrolls (up = past, down = future) so
// a business with hundreds of bookings never loads them all at once.
//
// Cursor design: pages are keyed on start_date only (works on both PostgREST
// and the guest Dexie client, which support gt/gte/lt/lte + order + limit but
// no composite keysets). After a page the cursor moves to the boundary date
// INCLUSIVELY — the boundary date's rows are re-fetched next page and removed
// by id-dedup, so ties across page borders are never skipped. If an entire
// page dedupes away (only possible when one date holds more rows than the
// page size), the cursor turns strict to guarantee progress.

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeBooking } from './repo';
import type { Booking } from './types';

export const AGENDA_PAGE_SIZE = 50;

export type AgendaDirection = 'past' | 'future';

export interface AgendaCursor {
  /** Boundary start_date for the next page in this direction. */
  date: string;
  /** Whether the boundary date itself is part of the next page (gte/lte vs gt/lt). */
  inclusive: boolean;
  /** True once a page in this direction came back short — nothing left to load. */
  exhausted: boolean;
}

export interface AgendaWindow {
  /** Loaded bookings, ascending by (start_date, id). */
  bookings: Booking[];
  past: AgendaCursor;
  future: AgendaCursor;
}

/** Empty window anchored at `today`: future = today onward, past = strictly before. */
export function initialAgendaWindow(today: string): AgendaWindow {
  return {
    bookings: [],
    past: { date: today, inclusive: false, exhausted: false },
    future: { date: today, inclusive: true, exhausted: false },
  };
}

function compareBookings(a: Booking, b: Booking): number {
  return a.start_date === b.start_date
    ? a.id.localeCompare(b.id)
    : a.start_date.localeCompare(b.start_date);
}

/**
 * Merges a fetched page into the window: id-dedup (boundary-date rows come
 * back twice by design), re-sort, and advance the direction's cursor.
 */
export function applyAgendaPage(
  window: AgendaWindow,
  direction: AgendaDirection,
  fetched: Booking[],
  pageSize: number = AGENDA_PAGE_SIZE,
): AgendaWindow {
  const known = new Set(window.bookings.map((b) => b.id));
  const fresh = fetched.filter((b) => !known.has(b.id));
  const bookings =
    fresh.length > 0 ? [...window.bookings, ...fresh].sort(compareBookings) : window.bookings;
  const exhausted = fetched.length < pageSize;

  const previous = direction === 'future' ? window.future : window.past;
  let cursor: AgendaCursor;
  if (fetched.length === 0) {
    cursor = { ...previous, exhausted };
  } else {
    const boundary = fetched.reduce(
      (acc, b) =>
        direction === 'future'
          ? b.start_date > acc
            ? b.start_date
            : acc
          : b.start_date < acc
            ? b.start_date
            : acc,
      fetched[0]!.start_date,
    );
    // Full page of already-known rows (one date larger than the page size):
    // turn strict so the next page moves past the boundary date.
    cursor = { date: boundary, inclusive: fresh.length > 0, exhausted };
  }
  return {
    bookings,
    past: direction === 'past' ? cursor : window.past,
    future: direction === 'future' ? cursor : window.future,
  };
}

/** One page of bookings in the given direction (includes cancelled — the list shows them struck through). */
export async function fetchAgendaPage(
  db: SupabaseClient,
  businessId: string,
  direction: AgendaDirection,
  cursor: AgendaCursor,
  pageSize: number = AGENDA_PAGE_SIZE,
): Promise<Booking[]> {
  let q = db.from('bookings').select('*').eq('business_id', businessId).is('deleted_at', null);
  if (direction === 'future') {
    q = cursor.inclusive ? q.gte('start_date', cursor.date) : q.gt('start_date', cursor.date);
    q = q.order('start_date', { ascending: true }).order('id', { ascending: true });
  } else {
    q = cursor.inclusive ? q.lte('start_date', cursor.date) : q.lt('start_date', cursor.date);
    q = q.order('start_date', { ascending: false }).order('id', { ascending: false });
  }
  const { data, error } = await q.limit(pageSize);
  if (error) {
    throw error;
  }
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeBooking);
}

/**
 * Re-reads the already-loaded date range in one query (bounded by how far the
 * user scrolled) so mutations made from the detail drawer show up without
 * resetting the scroll window. Cursors stay valid: the range is exactly what
 * the pages covered.
 */
export async function fetchAgendaRange(
  db: SupabaseClient,
  businessId: string,
  fromDate: string,
  toDate: string,
): Promise<Booking[]> {
  const { data, error } = await db
    .from('bookings')
    .select('*')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .gte('start_date', fromDate)
    .lte('start_date', toDate)
    .order('start_date', { ascending: true })
    .order('id', { ascending: true });
  if (error) {
    throw error;
  }
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeBooking);
}

export interface AgendaGroup {
  /** ISO start date shared by the group's bookings. */
  date: string;
  bookings: Booking[];
}

/** Groups window bookings (already sorted ascending) by start date, order preserved. */
export function groupAgenda(bookings: Booking[]): AgendaGroup[] {
  const groups: AgendaGroup[] = [];
  for (const b of bookings) {
    const last = groups[groups.length - 1];
    if (last && last.date === b.start_date) {
      last.bookings.push(b);
    } else {
      groups.push({ date: b.start_date, bookings: [b] });
    }
  }
  return groups;
}

/**
 * Index of the group the list should initially anchor on: the first group on
 * or after `today` (today's divider position); all-past lists anchor after the
 * end (scrolled to the bottom).
 */
export function todayAnchorIndex(groups: AgendaGroup[], today: string): number {
  const i = groups.findIndex((g) => g.date >= today);
  return i === -1 ? groups.length : i;
}
