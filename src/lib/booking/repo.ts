// Supabase data access for the Booking section. RLS scopes every query to
// the member's business; soft delete = deleted_at tombstones (never hard
// deletes); every update stamps updated_at (+ updated_by for audit). Money is
// decimal rupees on the wire (numeric(12,2) → JSON number).

import type { SupabaseClient } from '@supabase/supabase-js';
import { formatInvoiceNumber } from '@/lib/invoice/number';
import { insertWithOutbox, updateWithOutbox } from '@/lib/outbox/mutate';
import { todayIso } from './calendar';
import type {
  Booking,
  BookingPayment,
  BookingPermissions,
  BookingSource,
  BookingStatus,
  Business,
  DateBlock,
  PaymentMethod,
} from './types';
import { OWNER_PERMISSIONS } from './types';

export interface BusinessContext {
  business: Business;
  userId: string;
  isOwner: boolean;
  permissions: BookingPermissions;
  /** user_id → display name, for the audit line. */
  memberNames: Record<string, string>;
}

// Bookings are read with `select('*')` so reads keep working while the
// database schema lags the app (e.g. bookings.color before migration 005 is
// applied) — newly added optional columns simply come back absent and are
// normalized below instead of erroring the whole query.
const BOOKING_COLUMNS = '*';

/** Fills schema-lag gaps: columns the app knows but the server may not have yet. */
function normalizeBooking(row: Record<string, unknown>): Booking {
  const b = row as unknown as Booking;
  return { ...b, color: b.color ?? null };
}

/** Resolves the signed-in member's business, role and booking permissions. */
export async function fetchBusinessContext(db: SupabaseClient): Promise<BusinessContext | null> {
  const { data: auth } = await db.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) {
    return null;
  }
  const { data: businesses, error } = await db
    .from('businesses')
    .select('id, name, business_type, address, owner_name, logo_path, invoice_prefix, invoice_counter, owner_user_id')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error || !businesses || businesses.length === 0) {
    return null;
  }
  const business = businesses[0] as Business;
  const isOwner = business.owner_user_id === userId;

  const { data: members } = await db
    .from('business_members')
    .select('user_id, display_name, is_owner, permissions')
    .eq('business_id', business.id)
    .is('deleted_at', null);

  const memberNames: Record<string, string> = {};
  let permissions: BookingPermissions = isOwner
    ? OWNER_PERMISSIONS
    : { view: false, create: false, edit: false, delete: false, record_payment: false, generate_invoice: false };
  for (const m of members ?? []) {
    if (m.user_id) {
      memberNames[m.user_id] = m.display_name;
    }
    if (m.user_id === userId && !isOwner) {
      const p = (m.permissions?.booking ?? {}) as Partial<BookingPermissions>;
      permissions = {
        view: p.view === true || m.is_owner === true,
        create: p.create === true || m.is_owner === true,
        edit: p.edit === true || m.is_owner === true,
        delete: p.delete === true || m.is_owner === true,
        record_payment: p.record_payment === true || m.is_owner === true,
        generate_invoice: p.generate_invoice === true || m.is_owner === true,
      };
    }
  }
  memberNames[business.owner_user_id] ??= business.owner_name;
  return { business, userId, isOwner, permissions, memberNames };
}

export interface MonthData {
  bookings: Booking[];
  blocks: DateBlock[];
  paymentsByBooking: Record<string, BookingPayment[]>;
}

/** Everything the month view needs: bookings + blocks overlapping the range, and their payments. */
export async function fetchMonthData(
  db: SupabaseClient,
  businessId: string,
  rangeStart: string,
  rangeEnd: string,
): Promise<MonthData> {
  const [bookingsRes, blocksRes] = await Promise.all([
    db
      .from('bookings')
      .select(BOOKING_COLUMNS)
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .lte('start_date', rangeEnd)
      .gte('end_date', rangeStart)
      .order('start_date', { ascending: true }),
    db
      .from('date_blocks')
      .select('id, business_id, start_date, end_date, reason, created_by, deleted_at')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .lte('start_date', rangeEnd)
      .gte('end_date', rangeStart),
  ]);
  if (bookingsRes.error) {
    throw bookingsRes.error;
  }
  if (blocksRes.error) {
    throw blocksRes.error;
  }
  const bookings = ((bookingsRes.data ?? []) as Record<string, unknown>[]).map(normalizeBooking);
  const blocks = (blocksRes.data ?? []) as DateBlock[];

  const paymentsByBooking: Record<string, BookingPayment[]> = {};
  if (bookings.length > 0) {
    const { data: payments, error } = await db
      .from('booking_payments')
      .select('id, booking_id, business_id, amount, paid_on, method, notes, created_by, created_at, deleted_at')
      .in('booking_id', bookings.map((b) => b.id))
      .is('deleted_at', null)
      .order('paid_on', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) {
      throw error;
    }
    for (const p of (payments ?? []) as BookingPayment[]) {
      (paymentsByBooking[p.booking_id] ??= []).push(p);
    }
  }
  return { bookings, blocks, paymentsByBooking };
}

export interface BookingInput {
  event_type: string;
  event_icon: string;
  customer_name: string;
  customer_phone: string | null;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  total_amount: number;
  security_deposit: number;
  source: BookingSource | null;
  notes: string | null;
  status: BookingStatus;
  /** Key from shared/booking-colors.json; null = default themed look. */
  color: string | null;
}

/**
 * Creates a booking; a positive advance becomes booking_payments row #1 dated
 * today (§4.1). Writes go through the offline-aware data layer: when the
 * network is down the rows are queued in the Dexie outbox (client UUIDs make
 * the replay idempotent) and the optimistic local row is returned.
 */
export async function createBooking(
  db: SupabaseClient,
  businessId: string,
  userId: string,
  input: BookingInput,
  advance: number,
): Promise<Booking> {
  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    ...input,
    business_id: businessId,
    created_by: userId,
  };
  await insertWithOutbox(db, {
    module: 'booking',
    table: 'bookings',
    row,
    label: input.customer_name,
  });
  const booking: Booking = {
    ...row,
    invoice_number: null,
    updated_by: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  if (advance > 0) {
    await insertWithOutbox(db, {
      module: 'booking',
      table: 'booking_payments',
      row: {
        id: crypto.randomUUID(),
        booking_id: booking.id,
        business_id: businessId,
        amount: advance,
        paid_on: todayIso(),
        method: 'cash' satisfies PaymentMethod,
        created_by: userId,
      },
      label: input.customer_name,
    });
  }
  return booking;
}

/**
 * Updates a booking through the offline-aware data layer. Takes the full
 * booking snapshot so the queued op carries its `updated_at` as the
 * last-write-wins base (spec §8). Returns the optimistic merged row.
 */
export async function updateBooking(
  db: SupabaseClient,
  booking: Booking,
  userId: string,
  input: BookingInput,
): Promise<Booking> {
  const now = new Date().toISOString();
  const patch = { ...input, updated_by: userId, updated_at: now };
  await updateWithOutbox(db, {
    module: 'booking',
    table: 'bookings',
    entityId: booking.id,
    patch,
    baseUpdatedAt: booking.updated_at,
    label: input.customer_name,
  });
  return { ...booking, ...patch };
}

/** Cancel = status transition (releases the date); the row stays for the list view. */
export async function cancelBooking(db: SupabaseClient, booking: Booking, userId: string): Promise<void> {
  await updateWithOutbox(db, {
    module: 'booking',
    table: 'bookings',
    entityId: booking.id,
    patch: { status: 'cancelled', updated_by: userId, updated_at: new Date().toISOString() },
    baseUpdatedAt: booking.updated_at,
    label: booking.customer_name,
  });
}

export async function recordPayment(
  db: SupabaseClient,
  booking: Booking,
  userId: string,
  input: { amount: number; paid_on: string; method: PaymentMethod; notes: string | null },
): Promise<void> {
  await insertWithOutbox(db, {
    module: 'booking',
    table: 'booking_payments',
    row: {
      id: crypto.randomUUID(),
      booking_id: booking.id,
      business_id: booking.business_id,
      ...input,
      created_by: userId,
    },
    label: booking.customer_name,
  });
}

export async function createDateBlock(
  db: SupabaseClient,
  businessId: string,
  userId: string,
  input: { start_date: string; end_date: string; reason: string | null },
): Promise<void> {
  await insertWithOutbox(db, {
    module: 'booking',
    table: 'date_blocks',
    row: { id: crypto.randomUUID(), ...input, business_id: businessId, created_by: userId },
    label: input.reason ?? input.start_date,
  });
}

/** Soft delete (tombstone) — the shared convention for removals. */
export async function removeDateBlock(db: SupabaseClient, block: DateBlock): Promise<void> {
  await updateWithOutbox(db, {
    module: 'booking',
    table: 'date_blocks',
    entityId: block.id,
    patch: { deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    baseUpdatedAt: null,
    label: block.reason ?? block.start_date,
  });
}

/** Server-side overlap checks for the save-time conflict warning / block gate. */
export async function fetchOverlaps(
  db: SupabaseClient,
  businessId: string,
  start: string,
  end: string,
): Promise<{ bookings: Booking[]; blocks: DateBlock[] }> {
  const [bookingsRes, blocksRes] = await Promise.all([
    db
      .from('bookings')
      .select(BOOKING_COLUMNS)
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .lte('start_date', end)
      .gte('end_date', start),
    db
      .from('date_blocks')
      .select('id, business_id, start_date, end_date, reason, created_by, deleted_at')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .lte('start_date', end)
      .gte('end_date', start),
  ]);
  if (bookingsRes.error) {
    throw bookingsRes.error;
  }
  if (blocksRes.error) {
    throw blocksRes.error;
  }
  return {
    bookings: ((bookingsRes.data ?? []) as Record<string, unknown>[]).map(normalizeBooking),
    blocks: (blocksRes.data ?? []) as DateBlock[],
  };
}

/**
 * Assigns {prefix}-{YYYY}-{counter:04d} exactly once per booking
 * (layout-spec: Invoice number). Counter bump uses optimistic concurrency on
 * businesses.invoice_counter; the booking write is guarded with
 * invoice_number IS NULL so a concurrent winner's number is kept.
 */
export async function ensureInvoiceNumber(
  db: SupabaseClient,
  booking: Booking,
  userId: string,
): Promise<string> {
  if (booking.invoice_number) {
    return booking.invoice_number;
  }
  // Re-read in case another client assigned it since our snapshot.
  const { data: fresh } = await db
    .from('bookings')
    .select('invoice_number')
    .eq('id', booking.id)
    .single();
  if (fresh?.invoice_number) {
    return fresh.invoice_number as string;
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: biz, error } = await db
      .from('businesses')
      .select('invoice_prefix, invoice_counter')
      .eq('id', booking.business_id)
      .single();
    if (error || !biz) {
      throw error ?? new Error('business_not_found');
    }
    const nextCounter = (biz.invoice_counter as number) + 1;
    const { data: bumped, error: bumpError } = await db
      .from('businesses')
      .update({ invoice_counter: nextCounter, updated_at: new Date().toISOString() })
      .eq('id', booking.business_id)
      .eq('invoice_counter', biz.invoice_counter)
      .select('id');
    if (bumpError) {
      throw bumpError;
    }
    if (!bumped || bumped.length === 0) {
      continue; // lost the race — retry with the fresh counter
    }
    const number = formatInvoiceNumber(biz.invoice_prefix as string, new Date().getFullYear(), nextCounter);
    const { data: updated, error: setError } = await db
      .from('bookings')
      .update({ invoice_number: number, updated_by: userId, updated_at: new Date().toISOString() })
      .eq('id', booking.id)
      .is('invoice_number', null)
      .select('invoice_number');
    if (setError) {
      throw setError;
    }
    if (updated && updated.length > 0) {
      return number;
    }
    // Another client froze a number first — reuse theirs (immutability wins).
    const { data: theirs } = await db
      .from('bookings')
      .select('invoice_number')
      .eq('id', booking.id)
      .single();
    if (theirs?.invoice_number) {
      return theirs.invoice_number as string;
    }
  }
  throw new Error('invoice_number_contention');
}
