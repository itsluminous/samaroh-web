/**
 * Party-ledger computations (spec §4.2). Pure functions so the running
 * balance, per-party net and header totals are unit-testable.
 *
 * Sign convention: direction 'paid' = you gave (red), 'received' = you got
 * (green). Net balance = Σ(gave) − Σ(got); positive means the party owes you.
 */
import { round2 } from '@/lib/format/amount';

export type ExpenseDirection = 'paid' | 'received';

export interface LedgerEntryInput {
  id: string;
  direction: ExpenseDirection;
  amount: number;
  /** ISO date (yyyy-mm-dd). */
  expenseDate: string;
  /** ISO timestamp — tiebreaker for same-day entries. */
  createdAt: string;
}

export interface LedgerRow<T extends LedgerEntryInput = LedgerEntryInput> {
  entry: T;
  /** Net balance after this entry, in chronological order. */
  balanceAfter: number;
}

/** Chronological comparator: by expense date, then creation time, then id. */
function compareChronological(a: LedgerEntryInput, b: LedgerEntryInput): number {
  if (a.expenseDate !== b.expenseDate) {
    return a.expenseDate < b.expenseDate ? -1 : 1;
  }
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function signedAmount(entry: LedgerEntryInput): number {
  return entry.direction === 'paid' ? entry.amount : -entry.amount;
}

/**
 * Computes running balances and returns rows NEWEST FIRST (display order per
 * spec §4.2), each carrying the balance after that entry was applied in
 * chronological order.
 */
export function computeLedger<T extends LedgerEntryInput>(entries: T[]): LedgerRow<T>[] {
  const chronological = [...entries].sort(compareChronological);
  let balance = 0;
  const rows: LedgerRow<T>[] = chronological.map((entry) => {
    balance = round2(balance + signedAmount(entry));
    return { entry, balanceAfter: balance };
  });
  return rows.reverse();
}

/** Net balance for a set of entries: Σ(gave) − Σ(got). */
export function computeNetBalance(entries: LedgerEntryInput[]): number {
  return round2(entries.reduce((sum, entry) => sum + signedAmount(entry), 0));
}

export interface LedgerTotals {
  /** Total you gave (direction 'paid'). */
  gave: number;
  /** Total you got (direction 'received'). */
  got: number;
}

/** Header totals for the expenses home card: "You gave" / "You got". */
export function computeTotals(entries: LedgerEntryInput[]): LedgerTotals {
  let gave = 0;
  let got = 0;
  for (const entry of entries) {
    if (entry.direction === 'paid') {
      gave += entry.amount;
    } else {
      got += entry.amount;
    }
  }
  return { gave: round2(gave), got: round2(got) };
}
