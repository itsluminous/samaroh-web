/** Small view helpers for the expenses section. */
import type { LedgerEntryInput } from '@/lib/expenses/ledger';
import type { ExpenseRecord } from './queries';

/** Maps a Supabase expense row to the pure ledger computation input. */
export function toLedgerEntry(record: ExpenseRecord): LedgerEntryInput {
  return {
    id: record.id,
    direction: record.direction,
    amount: Number(record.amount),
    expenseDate: record.expense_date,
    createdAt: record.created_at,
  };
}

/** Initials for the party avatar: first letters of the first two words. */
export function partyInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return '';
  }
  const first = words[0]?.charAt(0) ?? '';
  const second = words[1]?.charAt(0) ?? '';
  return `${first}${second}`.toLocaleUpperCase();
}
