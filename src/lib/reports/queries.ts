/**
 * Data fetching for the reports (§4.4). Each report family pulls only the
 * projections it needs; RLS scopes every query to the member's business.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DateRange, ReportBooking, ReportExpense, ReportParty, ReportPayment } from './types';

const BOOKING_COLUMNS =
  'id, customer_name, event_type, event_icon, start_date, end_date, total_amount, status, source';

/** Bookings overlapping the range, plus all payments against them. */
export async function fetchBookingsWithPayments(
  db: SupabaseClient,
  businessId: string,
  range: DateRange,
): Promise<{ bookings: ReportBooking[]; payments: ReportPayment[] }> {
  const { data, error } = await db
    .from('bookings')
    .select(BOOKING_COLUMNS)
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .lte('start_date', range.end)
    .gte('end_date', range.start)
    .order('start_date', { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  const bookings = (data ?? []) as ReportBooking[];
  if (bookings.length === 0) {
    return { bookings, payments: [] };
  }
  const { data: payments, error: payError } = await db
    .from('booking_payments')
    .select('booking_id, amount, paid_on')
    .in('booking_id', bookings.map((b) => b.id))
    .is('deleted_at', null);
  if (payError) {
    throw new Error(payError.message);
  }
  return { bookings, payments: (payments ?? []) as ReportPayment[] };
}

/** All payments received in the range (cash-basis income for the profit view). */
export async function fetchPaymentsInRange(
  db: SupabaseClient,
  businessId: string,
  range: DateRange,
): Promise<ReportPayment[]> {
  const { data, error } = await db
    .from('booking_payments')
    .select('booking_id, amount, paid_on')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .gte('paid_on', range.start)
    .lte('paid_on', range.end);
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as ReportPayment[];
}

export async function fetchExpensesInRange(
  db: SupabaseClient,
  businessId: string,
  range: DateRange,
): Promise<ReportExpense[]> {
  const { data, error } = await db
    .from('expenses')
    .select('party_id, direction, amount, expense_date')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .gte('expense_date', range.start)
    .lte('expense_date', range.end);
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as ReportExpense[];
}

export async function fetchPartyNames(db: SupabaseClient, businessId: string): Promise<ReportParty[]> {
  const { data, error } = await db
    .from('parties')
    .select('id, name')
    .eq('business_id', businessId);
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as ReportParty[];
}
