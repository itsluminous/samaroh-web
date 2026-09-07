/**
 * Zero-stock rows on the current-stock list: master items with zero stock
 * (or no transactions at all) are no longer hidden — they are appended after
 * the in-stock rows, alphabetical within each group, rendered dimmed with
 * 0 qty and ₹0 value, and remain searchable. The empty state only shows when
 * the master list itself is empty.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { NextIntlClientProvider } from 'next-intl';
import theme from '@/theme/theme';
import en from '../messages/en.json';
import CurrentStockList from '@/app/[locale]/(app)/inventory/_components/CurrentStockList';
import type { CurrentInventoryRow } from '@/lib/inventory/fifo';

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

function row(overrides: Partial<CurrentInventoryRow> & { name: string }): CurrentInventoryRow {
  return {
    masterItemId: overrides.name.toLowerCase(),
    unit: 'pcs',
    imagePath: null,
    currentQuantity: 0,
    currentValue: 0,
    lastTransactionAt: null,
    ...overrides,
  };
}

// Deliberately unsorted and interleaved: display must be in-stock (Chairs,
// Tables) then zero-stock (Bowls, Plates), alphabetical within each group.
const rows: CurrentInventoryRow[] = [
  row({ name: 'Tables', currentQuantity: 10, currentValue: 5000 }),
  // Zero stock after full FIFO removal — has a last transaction.
  row({ name: 'Plates', lastTransactionAt: '2026-01-05T00:00:00Z' }),
  row({ name: 'Chairs', currentQuantity: 250, currentValue: 12500 }),
  // Never transacted masterlist item.
  row({ name: 'Bowls' }),
];

const fetchCurrentInventory = jest.fn(() => Promise.resolve(rows));

jest.mock('@/app/[locale]/(app)/inventory/_lib/queries', () => ({
  fetchCurrentInventory: () => fetchCurrentInventory(),
  fetchMasterItems: jest.fn(() => Promise.resolve([])),
  createImageUrls: jest.fn(() => Promise.resolve(new Map())),
}));

function renderList() {
  return render(
    <ThemeProvider theme={theme}>
      <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Kolkata">
        <CurrentStockList />
      </NextIntlClientProvider>
    </ThemeProvider>,
  );
}

/** The item-name order of the rendered stock rows. */
function listedNames(): string[] {
  return screen
    .getAllByRole('listitem')
    .map((item) => item.querySelector('.MuiListItemText-primary')?.textContent ?? '');
}

describe('CurrentStockList zero-stock rows', () => {
  beforeEach(() => {
    fetchCurrentInventory.mockClear();
    fetchCurrentInventory.mockResolvedValue(rows);
  });

  it('appends zero-stock items after in-stock items, alphabetical within group', async () => {
    renderList();
    await screen.findByText('Chairs');
    expect(listedNames()).toEqual(['Chairs', 'Tables', 'Bowls', 'Plates']);
  });

  it('renders zero-stock rows dimmed with 0 qty and ₹0 value', async () => {
    renderList();
    const bowls = (await screen.findByText('Bowls')).closest('li') as HTMLElement;
    const plates = screen.getByText('Plates').closest('li') as HTMLElement;
    const chairs = screen.getByText('Chairs').closest('li') as HTMLElement;

    // 0 qty + ₹0 value on both zero-stock variants (never-transacted and
    // fully-removed); the latter keeps its updated-relative-time suffix.
    expect(within(bowls).getByText('0 Pieces')).toBeInTheDocument();
    expect(within(bowls).getByText('\u20B90')).toBeInTheDocument();
    expect(within(plates).getByText(/^0 Pieces · Updated/)).toBeInTheDocument();
    expect(within(plates).getByText('\u20B90')).toBeInTheDocument();

    // Dimmed via opacity; in-stock rows are not.
    expect(within(bowls).getByRole('button')).toHaveStyle({ opacity: '0.55' });
    expect(within(plates).getByRole('button')).toHaveStyle({ opacity: '0.55' });
    expect(within(chairs).getByRole('button')).not.toHaveStyle({ opacity: '0.55' });
    expect(within(chairs).getByText('250 Pieces')).toBeInTheDocument();
    expect(within(chairs).getByText('\u20B912,500')).toBeInTheDocument();
  });

  it('zero-stock items are searchable', async () => {
    renderList();
    await screen.findByText('Chairs');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'plat' } });
    expect(screen.getByText('Plates')).toBeInTheDocument();
    expect(screen.queryByText('Chairs')).not.toBeInTheDocument();
    expect(screen.queryByText('Bowls')).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } });
    expect(screen.getByText(en.inventory.stock.no_results)).toBeInTheDocument();
  });

  it('shows the zero-stock list (not the empty state) when nothing is in stock', async () => {
    fetchCurrentInventory.mockResolvedValue([row({ name: 'Bowls' })]);
    renderList();
    expect(await screen.findByText('Bowls')).toBeInTheDocument();
    expect(screen.queryByText(en.inventory.stock.empty)).not.toBeInTheDocument();
  });

  it('shows the empty state only when the master list itself is empty', async () => {
    fetchCurrentInventory.mockResolvedValue([]);
    renderList();
    expect(await screen.findByText(en.inventory.stock.empty)).toBeInTheDocument();
  });
});
