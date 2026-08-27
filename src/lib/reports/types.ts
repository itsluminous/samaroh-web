// Row shapes the report computations work on — trimmed projections of the
// Supabase tables (§4.4). Money is decimal rupees (numeric(12,2) → number).

export interface ReportBooking {
  id: string;
  customer_name: string;
  event_type: string;
  event_icon: string;
  start_date: string; // ISO date
  end_date: string; // ISO date
  total_amount: number;
  status: 'tentative' | 'confirmed' | 'completed' | 'cancelled';
  source: string | null;
}

export interface ReportPayment {
  booking_id: string;
  amount: number;
  paid_on: string; // ISO date
}

export interface ReportExpense {
  party_id: string;
  direction: 'paid' | 'received';
  amount: number;
  expense_date: string; // ISO date
}

export interface ReportParty {
  id: string;
  name: string;
  /**
   * true = counts in the financial reports; false = personal party, shown
   * only in the personal-expenses report. Missing server/guest values are
   * normalized to true at fetch time.
   */
  business_related: boolean;
}

/**
 * An inventory `add` transaction (a stock purchase). Valued at
 * quantity × unit_price and counted as an expense in the money reports,
 * bucketed by the month of transaction_date — no expense ledger row exists.
 */
export interface ReportInventoryPurchase {
  quantity: number;
  unit_price: number;
  transaction_date: string; // ISO timestamp
}

/** Inclusive ISO date range every report is filtered by. */
export interface DateRange {
  start: string;
  end: string;
}

/** The 10 report keys (§4.4 + personal expenses) — also the dynamic route segment. */
export const REPORT_KEYS = [
  'revenue',
  'dues_aging',
  'occupancy',
  'event_types',
  'sources',
  'expense_summary',
  'profit',
  'personal_expenses',
  'inventory_valuation',
  'collection',
] as const;

export type ReportKey = (typeof REPORT_KEYS)[number];

export function isReportKey(value: string): value is ReportKey {
  return (REPORT_KEYS as readonly string[]).includes(value);
}
