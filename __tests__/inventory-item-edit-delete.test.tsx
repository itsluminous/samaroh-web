/**
 * Item-detail edit/delete affordances (web parity with the master list):
 * the header Edit button opens the same master-item dialog (prefilled, with
 * duplicate-name validation), Delete follows the blocked-while-the-item-has-
 * transactions rule with a confirmation, and both affordances are gated on
 * inventory.manage_master_items exactly like the master list.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '../messages/en.json';
import ItemDetail from '@/app/[locale]/(app)/inventory/_components/ItemDetail';
import {
  deleteMasterItem,
  updateMasterItem,
  fetchItemTransactions,
  type ItemTransactionRecord,
} from '@/app/[locale]/(app)/inventory/_lib/queries';

const item = {
  id: 'item1',
  name: 'Basmati Rice',
  unit: 'kg',
  image_path: null,
  created_at: '2026-01-01T00:00:00Z',
};

const otherItem = {
  id: 'item2',
  name: 'Chana Dal',
  unit: 'kg',
  image_path: null,
  created_at: '2026-01-02T00:00:00Z',
};

const oneTransaction: ItemTransactionRecord[] = [
  {
    id: 't1',
    transactionType: 'add',
    quantity: 5,
    unitPrice: 10,
    remainingQuantity: 5,
    transactionDate: '2026-01-10T12:00:00Z',
    notes: null,
  },
];

const pushMock = jest.fn();

jest.mock('@/lib/hooks/useBusiness', () => ({
  useBusiness: () => ({
    supabase: {},
    businessId: 'b1',
    userId: 'u1',
    loading: false,
    error: null,
  }),
}));

const mockUseMembership = jest.fn();
jest.mock('@/lib/permissions/useMembership', () => ({
  useMembership: () => mockUseMembership(),
}));

jest.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

jest.mock('@/app/[locale]/(app)/inventory/_lib/queries', () => ({
  InsufficientStockError: class InsufficientStockError extends Error {},
  recordAddTransaction: jest.fn().mockResolvedValue(undefined),
  recordRemoveTransaction: jest.fn().mockResolvedValue(0),
  fetchMasterItem: jest.fn(() => Promise.resolve(item)),
  fetchItemTransactions: jest.fn(() => Promise.resolve([])),
  fetchMasterItems: jest.fn(() => Promise.resolve([item, otherItem])),
  createImageUrls: jest.fn(() => Promise.resolve(new Map())),
  createMasterItem: jest.fn().mockResolvedValue('new-id'),
  updateMasterItem: jest.fn().mockResolvedValue(undefined),
  deleteMasterItem: jest.fn().mockResolvedValue(undefined),
  uploadItemImage: jest.fn().mockResolvedValue('path.webp'),
}));

const mockFetchItemTransactions = fetchItemTransactions as jest.Mock;
const mockUpdateMasterItem = updateMasterItem as jest.Mock;
const mockDeleteMasterItem = deleteMasterItem as jest.Mock;

function membership(manage: boolean, isOwner = false) {
  return {
    supabase: {},
    business: null,
    userId: 'u1',
    isOwner,
    permissions: { inventory: { manage_master_items: manage } },
    loading: false,
    error: null,
    refresh: jest.fn(),
  };
}

function renderDetail() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Kolkata">
      <ItemDetail itemId="item1" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseMembership.mockReturnValue(membership(true));
  mockFetchItemTransactions.mockImplementation(() => Promise.resolve([]));
});

describe('ItemDetail edit affordance', () => {
  it('opens the master-item edit dialog prefilled with the item', async () => {
    renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: en.common.action.edit }));
    expect(screen.getByText(en.inventory.master.edit_item)).toBeInTheDocument();
    expect(screen.getByLabelText(en.inventory.master.name_label)).toHaveValue('Basmati Rice');
  });

  it('rejects an empty name', async () => {
    renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: en.common.action.edit }));
    fireEvent.change(screen.getByLabelText(en.inventory.master.name_label), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    expect(await screen.findByText(en.inventory.master.name_required)).toBeInTheDocument();
    expect(mockUpdateMasterItem).not.toHaveBeenCalled();
  });

  it('rejects a name duplicating ANOTHER item (case-insensitive)', async () => {
    renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: en.common.action.edit }));
    fireEvent.change(screen.getByLabelText(en.inventory.master.name_label), {
      target: { value: 'chana dal' },
    });
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    expect(await screen.findByText(en.inventory.master.duplicate_exists)).toBeInTheDocument();
    expect(mockUpdateMasterItem).not.toHaveBeenCalled();
  });

  it('allows keeping the item own name and saves the edit', async () => {
    renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: en.common.action.edit }));
    fireEvent.change(screen.getByLabelText(en.inventory.master.name_label), {
      target: { value: '  Basmati Rice Premium  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    await waitFor(() => expect(mockUpdateMasterItem).toHaveBeenCalledTimes(1));
    expect(mockUpdateMasterItem).toHaveBeenCalledWith(
      expect.anything(),
      'item1',
      'Basmati Rice Premium',
      'kg',
      null,
    );
    expect(await screen.findByText(en.inventory.master.save_success)).toBeInTheDocument();
  });
});

describe('ItemDetail delete rule', () => {
  it('disables delete while the item has transactions', async () => {
    mockFetchItemTransactions.mockImplementation(() => Promise.resolve(oneTransaction));
    renderDetail();
    expect(await screen.findByRole('button', { name: en.common.action.delete })).toBeDisabled();
    expect(mockDeleteMasterItem).not.toHaveBeenCalled();
  });

  it('confirms, tombstones and navigates back when there are no transactions', async () => {
    renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: en.common.action.delete }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(en.inventory.master.delete_title)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: en.common.action.delete }));
    await waitFor(() => expect(mockDeleteMasterItem).toHaveBeenCalledWith(expect.anything(), 'item1'));
    expect(pushMock).toHaveBeenCalledWith('/inventory');
  });

  it('cancel keeps the item', async () => {
    renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: en.common.action.delete }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: en.common.action.cancel }));
    expect(mockDeleteMasterItem).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });
});

describe('ItemDetail permission gate (like the master list)', () => {
  it('hides edit and delete without inventory.manage_master_items', async () => {
    mockUseMembership.mockReturnValue(membership(false));
    renderDetail();
    await screen.findByText('Basmati Rice');
    expect(screen.queryByRole('button', { name: en.common.action.edit })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en.common.action.delete })).not.toBeInTheDocument();
  });

  it('shows them for owners even without the explicit permission', async () => {
    mockUseMembership.mockReturnValue(membership(false, true));
    renderDetail();
    expect(await screen.findByRole('button', { name: en.common.action.edit })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.common.action.delete })).toBeInTheDocument();
  });
});
