/**
 * Supabase data access for the expenses section (parties, expenses,
 * expense_attachments). All writes follow the app-wide contract: client
 * UUIDs, soft deletes via `deleted_at` tombstones, `updated_at` bumped by the
 * server trigger. RLS scopes every query to the caller's business membership.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Booking } from '@/lib/booking/types';
import {
  matchLinkedParty,
  matchLiveParty,
  newPartyFromBooking,
  PartyCreateForbiddenError,
  sortExpensesNewestFirst,
  type BookingExpenseRow,
} from '@/lib/expenses/bookingExpense';
import type { ExpenseDirection } from '@/lib/expenses/ledger';
import { insertWithOutbox, updateWithOutbox } from '@/lib/outbox/mutate';

export interface PartyRecord {
  id: string;
  name: string;
  phone: string | null;
  /**
   * true (default) = counts in the financial reports; false = personal party,
   * shown only in the personal-expenses report. Server column added by shared
   * migration 004 — apply it before deploying this app version.
   */
  business_related: boolean;
  /**
   * The booking this party REPRESENTS (an "event party", shared migration
   * 014, `on delete set null`); null for ordinary parties and for rows read
   * from a server that lags the migration.
   */
  booking_id: string | null;
  created_at: string;
}

/** Explicit party column list — keep in lockstep with PartyRecord. */
const PARTY_COLUMNS = 'id, name, phone, business_related, booking_id, created_at';

/** Coalesces schema-lag gaps (pre-004 flag, pre-014 link, older guest rows). */
function normalizeParty(row: PartyRecord): PartyRecord {
  return {
    ...row,
    business_related: normalizeBusinessRelated(row.business_related),
    booking_id: row.booking_id ?? null,
  };
}

/**
 * Coalesces a missing/null business_related to true: guest-mode rows created
 * before the flag existed have no such field (the local client projects it as
 * null), and true is the column default.
 */
export function normalizeBusinessRelated(value: unknown): boolean {
  return value !== false;
}

export interface ExpenseAttachmentRecord {
  id: string;
  expense_id: string;
  /** Null while the Google Drive upload is pending (pending badge). */
  drive_file_id: string | null;
  mime_type: string;
  file_name: string;
  deleted_at: string | null;
}

export interface ExpenseRecord {
  id: string;
  party_id: string;
  direction: ExpenseDirection;
  amount: number;
  expense_date: string;
  notes: string | null;
  /**
   * Linked booking when the entry was recorded against an event (shared
   * migration 012, `on delete set null`); null for plain ledger entries and
   * for rows read from a server that lags the migration.
   */
  booking_id: string | null;
  created_at: string;
  expense_attachments: ExpenseAttachmentRecord[];
}

/** Explicit expense column list — keep in lockstep with ExpenseRecord. */
const EXPENSE_COLUMNS = 'id, party_id, direction, amount, expense_date, notes, booking_id, created_at';

/** Coalesces an absent booking_id (pre-012 server / older guest rows) to null. */
function normalizeExpense<T extends { booking_id?: string | null }>(row: T): T & { booking_id: string | null } {
  return { ...row, booking_id: row.booking_id ?? null };
}

/**
 * sessionStorage key carrying the just-deleted party's name across the
 * ledger → list navigation so the list can show the deleted notice.
 */
export const PARTY_DELETED_NOTICE_KEY = 'samaroh_party_deleted';

export async function fetchParties(
  supabase: SupabaseClient,
  businessId: string,
): Promise<PartyRecord[]> {
  const { data, error } = await supabase
    .from('parties')
    .select(PARTY_COLUMNS)
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .order('name', { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as PartyRecord[]).map(normalizeParty);
}

export async function fetchParty(
  supabase: SupabaseClient,
  partyId: string,
): Promise<PartyRecord | null> {
  const { data, error } = await supabase
    .from('parties')
    .select(PARTY_COLUMNS)
    .eq('id', partyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  const row = data as PartyRecord | null;
  return row ? normalizeParty(row) : null;
}

/** All live expenses of the business (party aggregation happens client-side). */
export async function fetchBusinessExpenses(
  supabase: SupabaseClient,
  businessId: string,
): Promise<ExpenseRecord[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select(EXPENSE_COLUMNS)
    .eq('business_id', businessId)
    .is('deleted_at', null);
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as Omit<ExpenseRecord, 'expense_attachments'>[]).map((row) => ({
    ...normalizeExpense(row),
    expense_attachments: [],
  }));
}

/** One party's live expenses with their attachment metadata rows. */
export async function fetchPartyExpenses(
  supabase: SupabaseClient,
  partyId: string,
): Promise<ExpenseRecord[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select(
      `${EXPENSE_COLUMNS}, expense_attachments(id, expense_id, drive_file_id, mime_type, file_name, deleted_at)`,
    )
    .eq('party_id', partyId)
    .is('deleted_at', null);
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as ExpenseRecord[]).map((row) => ({
    ...normalizeExpense(row),
    expense_attachments: (row.expense_attachments ?? []).filter((a) => a.deleted_at === null),
  }));
}

/**
 * Contract §3b — the booking card's Expenses history: LIVE expenses linked to
 * this booking (`expenses.booking_id`, strictly — plain-ledger entries against
 * the event party are not listed), newest first. Never throws: a failed read
 * (e.g. a server lagging migration 012) hides the section instead of breaking
 * the card.
 */
export async function fetchBookingExpenses(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<BookingExpenseRow[]> {
  try {
    const { data, error } = await supabase
      .from('expenses')
      .select('id, direction, amount, expense_date, notes, created_at')
      .eq('booking_id', bookingId)
      .is('deleted_at', null);
    if (error) {
      return [];
    }
    return sortExpensesNewestFirst((data ?? []) as BookingExpenseRow[]);
  } catch {
    return [];
  }
}

/** The booking fields the party-ledger "Show event" control needs. */
export type LinkedBooking = Pick<
  Booking,
  'id' | 'customer_name' | 'event_type' | 'event_icon' | 'status' | 'start_date' | 'end_date' | 'deleted_at'
>;

/**
 * Live bookings behind the ledger's `booking_id` links (entries AND the event
 * party's own link), keyed by id. Missing ids (tombstoned, not pulled yet)
 * are simply absent — the "Show event" control is then omitted (contract
 * §3). Never throws: a failed lookup must not break the ledger, so it
 * degrades to "no bookings resolved".
 */
export async function fetchLinkedBookings(
  supabase: SupabaseClient,
  bookingIds: readonly string[],
): Promise<Record<string, LinkedBooking>> {
  const ids = Array.from(new Set(bookingIds));
  if (ids.length === 0) {
    return {};
  }
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('id, customer_name, event_type, event_icon, status, start_date, end_date, deleted_at')
      .in('id', ids)
      .is('deleted_at', null);
    if (error) {
      return {};
    }
    const out: Record<string, LinkedBooking> = {};
    for (const row of (data ?? []) as LinkedBooking[]) {
      out[row.id] = row;
    }
    return out;
  } catch {
    return {};
  }
}

/** The booking fields the event-party resolution reads. */
export type EventPartySource = Pick<
  Booking,
  'id' | 'event_type' | 'start_date' | 'customer_name' | 'customer_phone'
>;

/** PostgREST surfaces `uq_parties_biz_name` as a 23505 "duplicate key" message. */
function isUniqueViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /23505|duplicate key/i.test(message);
}

/** Contract §2.2 steps 1–2 against the business's live parties (no writes). */
function findEventParty(live: readonly PartyRecord[], booking: EventPartySource, name: string): PartyRecord | null {
  return matchLinkedParty(live, booking.id) ?? matchLiveParty(live, name);
}

/**
 * Contract §2.2 — the booking's EVENT PARTY, resolved at SAVE time, in order:
 * 1. BY LINK: a LIVE party with `booking_id = booking.id` (whatever its name;
 *    several → earliest created_at);
 * 2. BY NAME: a LIVE party whose `lower(trim(name))` equals the §2.1 event
 *    party name (`booking_id` is NOT back-filled — no silent edits);
 * 3. else CREATE `{name = §2.1, phone, business_related = true, booking_id}`
 *    — requires `expenses.manage_parties`; without it throws
 *    {@link PartyCreateForbiddenError} BEFORE any insert.
 * Phone is never back-filled. A 23505 on the create (another device won the
 * race on `uq_parties_biz_name`) re-resolves from step 1 once (step 5).
 */
export async function resolveBookingParty(
  supabase: SupabaseClient,
  businessId: string,
  booking: EventPartySource,
  canManageParties: boolean,
): Promise<PartyRecord> {
  const fresh = newPartyFromBooking(booking);
  const existing = findEventParty(await fetchParties(supabase, businessId), booking, fresh.name);
  if (existing) {
    return existing;
  }
  if (!canManageParties) {
    throw new PartyCreateForbiddenError(fresh.name);
  }
  try {
    return await createParty(supabase, businessId, fresh.name, fresh.phone, fresh.businessRelated, fresh.bookingId);
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    const winner = findEventParty(await fetchParties(supabase, businessId), booking, fresh.name);
    if (winner) {
      return winner;
    }
    throw error;
  }
}

export async function createParty(
  supabase: SupabaseClient,
  businessId: string,
  name: string,
  phone: string | null,
  businessRelated: boolean,
  /** Event link (migration 014) — set only for an event party created from a booking card. */
  bookingId: string | null = null,
): Promise<PartyRecord> {
  const record = {
    id: crypto.randomUUID(),
    business_id: businessId,
    name: name.trim(),
    phone: phone?.trim() || null,
    business_related: businessRelated,
    // Always on the wire (null for ordinary parties) — the server column must
    // exist first (owner applies shared migration 014 before this build ships).
    booking_id: bookingId,
  };
  await insertWithOutbox(supabase, { module: 'expenses', table: 'parties', row: record, label: record.name });
  return {
    id: record.id,
    name: record.name,
    phone: record.phone,
    business_related: record.business_related,
    booking_id: record.booking_id,
    created_at: new Date().toISOString(),
  };
}

/** Flips the business/personal flag on a party (editable per spec). */
export async function updatePartyBusinessRelated(
  supabase: SupabaseClient,
  party: PartyRecord,
  businessRelated: boolean,
): Promise<void> {
  await updateWithOutbox(supabase, {
    module: 'expenses',
    table: 'parties',
    entityId: party.id,
    patch: { business_related: businessRelated, updated_at: new Date().toISOString() },
    baseUpdatedAt: null,
    label: party.name,
  });
}

export interface PartyInput {
  name: string;
  phone: string | null;
  businessRelated: boolean;
}

/** Full party edit (name / phone / business flag) — create parity. */
export async function updateParty(
  supabase: SupabaseClient,
  partyId: string,
  input: PartyInput,
): Promise<void> {
  const name = input.name.trim();
  await updateWithOutbox(supabase, {
    module: 'expenses',
    table: 'parties',
    entityId: partyId,
    patch: {
      name,
      phone: input.phone?.trim() || null,
      business_related: input.businessRelated,
      updated_at: new Date().toISOString(),
    },
    baseUpdatedAt: null,
    label: name,
  });
}

/**
 * Deletes a party and CASCADE-tombstones everything under it: every live
 * expense of the party and every live attachment of those expenses get the
 * same `deleted_at`, then the party itself. All writes are per-row outbox
 * updates (offline they queue as delete payloads and replay FIFO; in guest
 * mode they land straight in the Dexie store). Children go first so a crash
 * mid-way never leaves orphaned live entries under a deleted party.
 */
export async function deleteParty(supabase: SupabaseClient, party: PartyRecord): Promise<void> {
  const deletedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('expenses')
    .select('id, expense_attachments(id, deleted_at)')
    .eq('party_id', party.id)
    .is('deleted_at', null);
  if (error) {
    throw new Error(error.message);
  }
  const expenses = (data ?? []) as {
    id: string;
    expense_attachments: { id: string; deleted_at: string | null }[] | null;
  }[];
  for (const expense of expenses) {
    for (const attachment of expense.expense_attachments ?? []) {
      if (attachment.deleted_at !== null) {
        continue;
      }
      await updateWithOutbox(supabase, {
        module: 'expenses',
        table: 'expense_attachments',
        entityId: attachment.id,
        patch: { deleted_at: deletedAt },
        baseUpdatedAt: null,
        label: party.name,
      });
    }
    await updateWithOutbox(supabase, {
      module: 'expenses',
      table: 'expenses',
      entityId: expense.id,
      patch: { deleted_at: deletedAt, updated_at: deletedAt },
      baseUpdatedAt: null,
      label: party.name,
    });
  }
  await updateWithOutbox(supabase, {
    module: 'expenses',
    table: 'parties',
    entityId: party.id,
    patch: { deleted_at: deletedAt, updated_at: deletedAt },
    baseUpdatedAt: null,
    label: party.name,
  });
}

export interface ExpenseInput {
  direction: ExpenseDirection;
  amount: number;
  expenseDate: string;
  notes: string | null;
  /** Event link (migration 012). Absent/undefined = plain ledger entry (null on the wire). */
  bookingId?: string | null;
}

// NOTE: no attachment-create path on web. Bill files are uploaded to Google
// Drive by the Android app (compress → upload → row op); the web app has no
// Drive credentials, so inserting metadata-only rows here would strand them
// in the "pending" state forever. Attachments are display + remove only
// (see docs/decisions.md — a server-side Drive upload route is the reserved
// future design).

export async function createExpense(
  supabase: SupabaseClient,
  businessId: string,
  partyId: string,
  userId: string,
  input: ExpenseInput,
): Promise<void> {
  const expenseId = crypto.randomUUID();
  await insertWithOutbox(supabase, {
    module: 'expenses',
    table: 'expenses',
    row: {
      id: expenseId,
      business_id: businessId,
      party_id: partyId,
      direction: input.direction,
      amount: input.amount,
      expense_date: input.expenseDate,
      notes: input.notes,
      // Always on the wire (null for plain entries) — the server column must
      // exist first (owner applies shared migration 012 before this build ships).
      booking_id: input.bookingId ?? null,
      created_by: userId,
    },
    // The ledger entry itself is the label (amount is formatted at display time).
    label: input.notes ?? input.expenseDate,
  });
}

export async function updateExpense(
  supabase: SupabaseClient,
  expenseId: string,
  input: ExpenseInput,
  removedAttachmentIds: string[],
): Promise<void> {
  await updateWithOutbox(supabase, {
    module: 'expenses',
    table: 'expenses',
    entityId: expenseId,
    patch: {
      amount: input.amount,
      expense_date: input.expenseDate,
      notes: input.notes,
      updated_at: new Date().toISOString(),
    },
    baseUpdatedAt: null,
    label: input.notes ?? input.expenseDate,
  });
  if (removedAttachmentIds.length > 0) {
    const { error: attachmentError } = await supabase
      .from('expense_attachments')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', removedAttachmentIds);
    if (attachmentError) {
      throw new Error(attachmentError.message);
    }
  }
}

/** Tombstone delete: the row (and its attachments) stay for sync, hidden from UI. */
export async function deleteExpense(supabase: SupabaseClient, expenseId: string): Promise<void> {
  const deletedAt = new Date().toISOString();
  const { error } = await supabase
    .from('expenses')
    .update({ deleted_at: deletedAt })
    .eq('id', expenseId);
  if (error) {
    throw new Error(error.message);
  }
  const { error: attachmentError } = await supabase
    .from('expense_attachments')
    .update({ deleted_at: deletedAt })
    .eq('expense_id', expenseId)
    .is('deleted_at', null);
  if (attachmentError) {
    throw new Error(attachmentError.message);
  }
}
