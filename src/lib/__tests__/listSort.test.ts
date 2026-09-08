/**
 * List-sort logic (Android parity): comparator orderings (last updated
 * newest-first with undated rows last and name tiebreak; name asc/desc) and
 * the per-list localStorage persistence helpers with their defaults.
 */
import {
  DEFAULT_LIST_SORT,
  PARTY_LIST_SORT_STORAGE_KEY,
  STOCK_LIST_SORT_STORAGE_KEY,
  listSortComparator,
  readListSort,
  writeListSort,
  type ListSortAccessors,
} from '../listSort';

interface Row {
  name: string;
  at: string | null;
}

const accessors: ListSortAccessors<Row> = {
  name: (row) => row.name,
  lastActivityAt: (row) => row.at,
};

const rows: Row[] = [
  { name: 'Meera', at: null },
  { name: 'Anaya', at: '2026-01-05T10:00:00Z' },
  { name: 'Zubin', at: '2026-02-01T10:00:00Z' },
  { name: 'Kabir', at: null },
];

const names = (sorted: Row[]) => sorted.map((row) => row.name);

describe('listSortComparator', () => {
  it('last_updated puts newest activity first and undated rows last', () => {
    const sorted = [...rows].sort(listSortComparator('last_updated', accessors));
    expect(names(sorted)).toEqual(['Zubin', 'Anaya', 'Kabir', 'Meera']);
  });

  it('last_updated breaks timestamp ties (and undated pairs) by name A to Z', () => {
    const tied: Row[] = [
      { name: 'B', at: '2026-01-01T00:00:00Z' },
      { name: 'A', at: '2026-01-01T00:00:00Z' },
    ];
    expect(names(tied.sort(listSortComparator('last_updated', accessors)))).toEqual(['A', 'B']);
    // Undated pair: Kabir before Meera (see the full-list expectation above).
  });

  it('name_asc sorts A to Z regardless of activity', () => {
    const sorted = [...rows].sort(listSortComparator('name_asc', accessors));
    expect(names(sorted)).toEqual(['Anaya', 'Kabir', 'Meera', 'Zubin']);
  });

  it('name_desc sorts Z to A regardless of activity', () => {
    const sorted = [...rows].sort(listSortComparator('name_desc', accessors));
    expect(names(sorted)).toEqual(['Zubin', 'Meera', 'Kabir', 'Anaya']);
  });
});

describe('list sort persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults to last_updated when nothing is stored', () => {
    expect(readListSort(STOCK_LIST_SORT_STORAGE_KEY)).toBe('last_updated');
    expect(DEFAULT_LIST_SORT).toBe('last_updated');
  });

  it('round-trips a written order', () => {
    writeListSort(STOCK_LIST_SORT_STORAGE_KEY, 'name_desc');
    expect(readListSort(STOCK_LIST_SORT_STORAGE_KEY)).toBe('name_desc');
  });

  it('persists per list — the two lists never share a key', () => {
    expect(STOCK_LIST_SORT_STORAGE_KEY).not.toBe(PARTY_LIST_SORT_STORAGE_KEY);
    writeListSort(STOCK_LIST_SORT_STORAGE_KEY, 'name_asc');
    expect(readListSort(PARTY_LIST_SORT_STORAGE_KEY)).toBe('last_updated');
  });

  it('ignores garbage stored values and falls back to the default', () => {
    window.localStorage.setItem(STOCK_LIST_SORT_STORAGE_KEY, 'sideways');
    expect(readListSort(STOCK_LIST_SORT_STORAGE_KEY)).toBe('last_updated');
  });
});
