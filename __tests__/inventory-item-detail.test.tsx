// Item detail page: header with FIFO stock/value, newest-first transaction
// table windowed 20/page with Load more + "Showing N of M", and Add/Remove
// entry points opening the transaction dialog pre-selected to the item.

import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '../messages/en.json';
import ItemDetail from '@/app/[locale]/(app)/inventory/_components/ItemDetail';
import type { ItemTransactionRecord } from '@/app/[locale]/(app)/inventory/_lib/queries';

const item = {
  id: 'item1',
  name: 'Basmati Rice',
  unit: 'kg',
  image_path: null,
  created_at: '2026-01-01T00:00:00Z',
};

// 25 add transactions of 1 kg @ ₹10, all still open → stock 25, value ₹250.
const transactions: ItemTransactionRecord[] = Array.from({ length: 25 }, (_, i) => ({
  id: `t${i + 1}`,
  transactionType: 'add' as const,
  quantity: 1,
  unitPrice: 10,
  remainingQuantity: 1,
  transactionDate: new Date(Date.UTC(2026, 0, 25 - i, 12)).toISOString(),
  notes: i === 0 ? 'first note' : null,
}));

jest.mock('@/lib/hooks/useBusiness', () => ({
  useBusiness: () => ({
    supabase: {},
    businessId: 'b1',
    userId: 'u1',
    loading: false,
    error: null,
  }),
}));

jest.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/app/[locale]/(app)/inventory/_lib/queries', () => ({
  InsufficientStockError: class InsufficientStockError extends Error {},
  recordAddTransaction: jest.fn().mockResolvedValue(undefined),
  recordRemoveTransaction: jest.fn().mockResolvedValue(0),
  fetchMasterItem: jest.fn(() => Promise.resolve(item)),
  fetchItemTransactions: jest.fn(() => Promise.resolve(transactions)),
  fetchMasterItems: jest.fn(() => Promise.resolve([item])),
  createImageUrls: jest.fn(() => Promise.resolve(new Map())),
}));

function renderDetail() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Kolkata">
      <ItemDetail itemId="item1" />
    </NextIntlClientProvider>,
  );
}

describe('ItemDetail', () => {
  it('shows the header with name, FIFO stock and total value', async () => {
    renderDetail();
    expect(await screen.findByText('Basmati Rice')).toBeInTheDocument();
    expect(screen.getByText('In stock: 25 Kg')).toBeInTheDocument();
    expect(screen.getByText('\u20B9250')).toBeInTheDocument();
    expect(screen.getByText(en.inventory.stock.value_label)).toBeInTheDocument();
  });

  it('windows the transaction table 20 per page with Load more', async () => {
    renderDetail();
    expect(await screen.findByText('Showing 20 of 25 transactions')).toBeInTheDocument();
    // Header row + 20 data rows.
    expect(screen.getAllByRole('row')).toHaveLength(21);

    fireEvent.click(screen.getByRole('button', { name: en.inventory.item.load_more }));
    expect(screen.getByText('Showing 25 of 25 transactions')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(26);
    expect(
      screen.queryByRole('button', { name: en.inventory.item.load_more }),
    ).not.toBeInTheDocument();
  });

  it('renders type chips, per-row total price and notes', async () => {
    renderDetail();
    await screen.findByText('Showing 20 of 25 transactions');
    expect(screen.getAllByText(en.inventory.txn.add).length).toBeGreaterThanOrEqual(20);
    // 1 kg × ₹10 per row.
    expect(screen.getAllByText('\u20B910').length).toBeGreaterThanOrEqual(20);
    expect(screen.getByText('first note')).toBeInTheDocument();
  });

  it('opens the transaction dialog pre-selected to this item via Add/Remove', async () => {
    renderDetail();
    await screen.findByText('Basmati Rice');
    fireEvent.click(screen.getByRole('button', { name: en.inventory.txn.remove }));
    expect(screen.getByRole('combobox')).toHaveValue('Basmati Rice');
    expect(
      screen.getByRole('button', { name: en.inventory.txn.remove, pressed: true }),
    ).toBeInTheDocument();
  });
});
