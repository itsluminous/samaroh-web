/**
 * List sort preference (Android parity): the Inventory stock list and the
 * Expenses party list both get a sort control with three orders. Default is
 * LAST UPDATED (newest first — most recent ledger entry for a party, last
 * transaction for a stock item); A→Z / Z→A sort by name. The chosen order is
 * persisted per list in localStorage (device-local UI preference, same
 * contract as the booking view toggle / form-field prefs).
 *
 * Zero-stock grouping is orthogonal: the stock list keeps zero-stock items
 * grouped dimmed at the END, sorted by the same chosen order within the
 * group. Search filtering is unaffected by the sort choice.
 */

export type ListSortOrder = 'last_updated' | 'name_asc' | 'name_desc';

export const DEFAULT_LIST_SORT: ListSortOrder = 'last_updated';

export const LIST_SORT_ORDERS: readonly ListSortOrder[] = [
  'last_updated',
  'name_asc',
  'name_desc',
];

/** localStorage keys, one per list (per-list persistence). */
export const STOCK_LIST_SORT_STORAGE_KEY = 'samaroh_inventory_stock_sort';
export const PARTY_LIST_SORT_STORAGE_KEY = 'samaroh_expenses_party_sort';

function isListSortOrder(value: unknown): value is ListSortOrder {
  return (LIST_SORT_ORDERS as readonly unknown[]).includes(value);
}

export function readListSort(storageKey: string): ListSortOrder {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (isListSortOrder(raw)) {
      return raw;
    }
  } catch {
    // Storage unavailable (privacy mode / SSR) → default.
  }
  return DEFAULT_LIST_SORT;
}

export function writeListSort(storageKey: string, order: ListSortOrder): void {
  try {
    window.localStorage.setItem(storageKey, order);
  } catch {
    // Best-effort persistence, mirroring the other device-local prefs.
  }
}

/** Row accessors so callers sort their own row shapes without remapping. */
export interface ListSortAccessors<T> {
  name: (row: T) => string;
  /** ISO timestamp of the row's most recent activity, or null if none. */
  lastActivityAt: (row: T) => string | null;
}

/**
 * Comparator for the chosen order. `last_updated` puts the newest activity
 * first; rows with no activity sort after all dated rows, and ties (equal
 * timestamps or both undated) fall back to A→Z so the order is stable and
 * predictable. ISO-8601 UTC timestamps compare correctly as plain strings.
 */
export function listSortComparator<T>(
  order: ListSortOrder,
  accessors: ListSortAccessors<T>,
): (a: T, b: T) => number {
  const byNameAsc = (a: T, b: T) => accessors.name(a).localeCompare(accessors.name(b));
  switch (order) {
    case 'name_asc':
      return byNameAsc;
    case 'name_desc':
      return (a, b) => -byNameAsc(a, b);
    case 'last_updated':
      return (a, b) => {
        const timeA = accessors.lastActivityAt(a);
        const timeB = accessors.lastActivityAt(b);
        if (timeA !== timeB) {
          if (timeA === null) {
            return 1;
          }
          if (timeB === null) {
            return -1;
          }
          return timeA < timeB ? 1 : -1;
        }
        return byNameAsc(a, b);
      };
  }
}
