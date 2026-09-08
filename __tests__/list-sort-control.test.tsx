/**
 * Sort control on the Inventory stock list and the Expenses party list
 * (Android parity): icon + three-option menu — default LAST UPDATED (newest
 * first; party = most recent entry, item = last transaction), Name A to Z /
 * Z to A. The choice persists per list in localStorage; zero-stock items stay
 * grouped dimmed at the END within the chosen sort; search is unaffected.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { NextIntlClientProvider } from 'next-intl';
import theme from '@/theme/theme';
import en from '../messages/en.json';
import ExpensesHome from '@/app/[locale]/(app)/expenses/_components/ExpensesHome';
import CurrentStockList from '@/app/[locale]/(app)/inventory/_components/CurrentStockList';
import type { CurrentInventoryRow } from '@/lib/inventory/fifo';
import {
  PARTY_LIST_SORT_STORAGE_KEY,
  STOCK_LIST_SORT_STORAGE_KEY,
} from '@/lib/listSort';

jest.mock('@/lib/permissions/useMembership', () => ({
  useMembership: () => ({
    supabase: {},
    business: { id: 'b1', name: 'Biz' },
    userId: 'u1',
    isOwner: true,
    permissions: {},
    loading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));

jest.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

// --- Inventory fixtures -----------------------------------------------------

function stockRow(
  overrides: Partial<CurrentInventoryRow> & { name: string },
): CurrentInventoryRow {
  return {
    masterItemId: overrides.name.toLowerCase(),
    unit: 'pcs',
    driveImageId: null,
    currentQuantity: 0,
    currentValue: 0,
    lastTransactionAt: null,
    ...overrides,
  };
}

// In-stock: Chairs (Mar) newer than Tables (Jan). Zero-stock: Plates has a
// (newer than everything) last transaction, Bowls never transacted — yet both
// must stay grouped at the END in every sort.
const stockRows: CurrentInventoryRow[] = [
  stockRow({ name: 'Tables', currentQuantity: 10, currentValue: 5000, lastTransactionAt: '2026-01-01T00:00:00Z' }),
  stockRow({ name: 'Plates', lastTransactionAt: '2026-04-01T00:00:00Z' }),
  stockRow({ name: 'Chairs', currentQuantity: 250, currentValue: 12500, lastTransactionAt: '2026-03-01T00:00:00Z' }),
  stockRow({ name: 'Bowls' }),
];

jest.mock('@/app/[locale]/(app)/inventory/_lib/queries', () => ({
  fetchCurrentInventory: jest.fn(() => Promise.resolve(stockRows)),
  fetchMasterItems: jest.fn(() => Promise.resolve([])),
}));

// --- Expenses fixtures -------------------------------------------------------

function party(id: string, name: string) {
  return { id, name, phone: null, business_related: true, created_at: '2026-01-01T00:00:00Z' };
}

function expense(id: string, partyId: string, createdAt: string) {
  return {
    id,
    party_id: partyId,
    direction: 'paid' as const,
    amount: 100,
    expense_date: createdAt.slice(0, 10),
    notes: null,
    created_at: createdAt,
    expense_attachments: [],
  };
}

// Last entries: Zubin (Feb) > Anaya (Jan); Meera has none.
const parties = [party('p1', 'Anaya'), party('p2', 'Zubin'), party('p3', 'Meera')];
const expenses = [
  expense('e1', 'p1', '2026-01-05T10:00:00Z'),
  expense('e2', 'p2', '2026-02-01T10:00:00Z'),
  expense('e3', 'p2', '2026-01-02T10:00:00Z'),
];

jest.mock('@/app/[locale]/(app)/expenses/_lib/queries', () => ({
  ...jest.requireActual('@/app/[locale]/(app)/expenses/_lib/queries'),
  fetchParties: jest.fn(() => Promise.resolve(parties)),
  fetchBusinessExpenses: jest.fn(() => Promise.resolve(expenses)),
}));

// --- Helpers -----------------------------------------------------------------

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <ThemeProvider theme={theme}>
      <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Kolkata">
        {ui}
      </NextIntlClientProvider>
    </ThemeProvider>,
  );
}

/** Names of the rendered list rows, in display order. */
function listedNames(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.MuiListItemText-primary')).map(
    (node) => node.textContent ?? '',
  );
}

function pickSort(option: string) {
  fireEvent.click(screen.getByRole('button', { name: en.common.sort.open }));
  fireEvent.click(screen.getByRole('menuitem', { name: option }));
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('CurrentStockList sorting', () => {
  it('defaults to last updated (newest transaction first), zero-stock grouped at the end', async () => {
    const { container } = renderWithIntl(<CurrentStockList />);
    await screen.findByText('Chairs');
    // In-stock: Chairs (Mar) then Tables (Jan). Zero-stock stays at the END
    // even though Plates has the newest transaction of all: Plates (dated)
    // then Bowls (never transacted).
    expect(listedNames(container)).toEqual(['Chairs', 'Tables', 'Plates', 'Bowls']);
  });

  it('re-sorts A to Z and Z to A within each group, zero-stock still last', async () => {
    const { container } = renderWithIntl(<CurrentStockList />);
    await screen.findByText('Chairs');

    pickSort(en.common.sort.name_asc);
    expect(listedNames(container)).toEqual(['Chairs', 'Tables', 'Bowls', 'Plates']);

    pickSort(en.common.sort.name_desc);
    expect(listedNames(container)).toEqual(['Tables', 'Chairs', 'Plates', 'Bowls']);
  });

  it('persists the choice under the stock-list key and restores it on remount', async () => {
    const first = renderWithIntl(<CurrentStockList />);
    await screen.findByText('Chairs');
    pickSort(en.common.sort.name_desc);
    expect(window.localStorage.getItem(STOCK_LIST_SORT_STORAGE_KEY)).toBe('name_desc');
    // Per-list persistence: the party list's key is untouched.
    expect(window.localStorage.getItem(PARTY_LIST_SORT_STORAGE_KEY)).toBeNull();
    first.unmount();

    const second = renderWithIntl(<CurrentStockList />);
    await screen.findByText('Chairs');
    expect(listedNames(second.container)).toEqual(['Tables', 'Chairs', 'Plates', 'Bowls']);
  });

  it('search filters rows but keeps the chosen order and zero-stock grouping', async () => {
    window.localStorage.setItem(STOCK_LIST_SORT_STORAGE_KEY, 'name_desc');
    const { container } = renderWithIntl(<CurrentStockList />);
    await screen.findByText('Chairs');
    // "es" matches Tables and Plates only; group order (in-stock before
    // zero-stock) survives the filter.
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'es' } });
    expect(listedNames(container)).toEqual(['Tables', 'Plates']);
  });
});

describe('ExpensesHome party sorting', () => {
  it('defaults to last updated: most recent entry first, no-entry parties last', async () => {
    const { container } = renderWithIntl(<ExpensesHome />);
    await screen.findByText('Anaya');
    expect(listedNames(container)).toEqual(['Zubin', 'Anaya', 'Meera']);
  });

  it('re-sorts A to Z and Z to A from the menu', async () => {
    const { container } = renderWithIntl(<ExpensesHome />);
    await screen.findByText('Anaya');

    pickSort(en.common.sort.name_asc);
    expect(listedNames(container)).toEqual(['Anaya', 'Meera', 'Zubin']);

    pickSort(en.common.sort.name_desc);
    expect(listedNames(container)).toEqual(['Zubin', 'Meera', 'Anaya']);
  });

  it('persists the choice under the party-list key and restores it on remount', async () => {
    const first = renderWithIntl(<ExpensesHome />);
    await screen.findByText('Anaya');
    pickSort(en.common.sort.name_asc);
    expect(window.localStorage.getItem(PARTY_LIST_SORT_STORAGE_KEY)).toBe('name_asc');
    expect(window.localStorage.getItem(STOCK_LIST_SORT_STORAGE_KEY)).toBeNull();
    first.unmount();

    const second = renderWithIntl(<ExpensesHome />);
    await screen.findByText('Anaya');
    expect(listedNames(second.container)).toEqual(['Anaya', 'Meera', 'Zubin']);
  });

  it('search filters parties without disturbing the chosen order', async () => {
    const { container } = renderWithIntl(<ExpensesHome />);
    await screen.findByText('Anaya');
    // "a" matches all three; default order preserved among matches.
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'e' } });
    expect(listedNames(container)).toEqual(['Meera']);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    expect(listedNames(container)).toEqual(['Zubin', 'Anaya', 'Meera']);
  });
});

describe('sort control placement (expenses parity)', () => {
  it('inventory: the sort button sits beside the search bar, not in the title row', async () => {
    renderWithIntl(<CurrentStockList />);
    await screen.findByText('Chairs');
    const sortButton = screen.getByRole('button', { name: en.common.sort.open });
    const search = screen.getByRole('searchbox');
    // Same flex container as the search field…
    expect(sortButton.parentElement).toContainElement(search);
    // …and not next to the title/masterlist toggle.
    const masterlistButton = screen.getByRole('button', {
      name: en.inventory.stock.open_masterlist,
    });
    expect(sortButton.parentElement).not.toBe(masterlistButton.parentElement);
  });

  it('expenses: the sort button shares the search bar container (the mirrored layout)', async () => {
    renderWithIntl(<ExpensesHome />);
    await screen.findByText('Anaya');
    const sortButton = screen.getByRole('button', { name: en.common.sort.open });
    expect(sortButton.parentElement).toContainElement(screen.getByRole('searchbox'));
  });
});
