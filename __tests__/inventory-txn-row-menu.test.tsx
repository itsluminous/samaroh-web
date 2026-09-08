/**
 * Item-detail transaction rows: a per-row three-dots menu with Edit (gated
 * on inventory.edit) and Delete (inventory.delete); Edit opens the
 * edit-transaction dialog, Delete confirms then delegates to the
 * replay-aware data layer — a rejected mutation (historical negative stock)
 * surfaces the localized error and persists nothing. Plus the fixed bottom
 * bar: big Add/Remove buttons in the inventory palette (primary/secondary,
 * NOT the expenses red/green), gated on inventory.create.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '../messages/en.json';
import ItemDetail from '@/app/[locale]/(app)/inventory/_components/ItemDetail';
import {
  deleteInventoryTransaction,
  HistoricalNegativeStockError,
  updateInventoryTransaction,
  type ItemTransactionRecord,
} from '@/app/[locale]/(app)/inventory/_lib/queries';
import { emptyPermissions, type MemberPermissions } from '@/lib/permissions/permissions';

const item = {
  id: 'item1',
  name: 'Basmati Rice',
  unit: 'kg',
  drive_image_id: null,
  created_at: '2026-01-01T00:00:00Z',
};

const transactions: ItemTransactionRecord[] = [
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
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/app/[locale]/(app)/inventory/_lib/queries', () => {
  class MockHistoricalNegativeStockError extends Error {}
  return {
    InsufficientStockError: class InsufficientStockError extends Error {},
    HistoricalNegativeStockError: MockHistoricalNegativeStockError,
    recordAddTransaction: jest.fn().mockResolvedValue(undefined),
    recordRemoveTransaction: jest.fn().mockResolvedValue(0),
    updateInventoryTransaction: jest.fn().mockResolvedValue(undefined),
    deleteInventoryTransaction: jest.fn().mockResolvedValue(undefined),
    fetchMasterItem: jest.fn(() => Promise.resolve(item)),
    fetchItemTransactions: jest.fn(() => Promise.resolve(transactions)),
    fetchMasterItems: jest.fn(() => Promise.resolve([item])),
  };
});

const mockUpdateTxn = updateInventoryTransaction as jest.Mock;
const mockDeleteTxn = deleteInventoryTransaction as jest.Mock;

function membership(permissions: MemberPermissions, isOwner = false) {
  return {
    supabase: {},
    business: { id: 'b1', name: 'Biz' },
    userId: 'u1',
    isOwner,
    permissions,
    loading: false,
    error: null,
    refresh: jest.fn(),
  };
}

function perms(overrides: Partial<MemberPermissions['inventory']> = {}): MemberPermissions {
  const p = emptyPermissions();
  p.inventory = { ...p.inventory, view: true, ...overrides };
  return p;
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
});

describe('transaction row menu', () => {
  it('hides the three-dots menu without inventory.edit AND inventory.delete', async () => {
    mockUseMembership.mockReturnValue(membership(perms()));
    renderDetail();
    await screen.findByText('Basmati Rice');
    expect(screen.queryByLabelText(en.inventory.item.txn_more)).not.toBeInTheDocument();
  });

  it('shows only Edit with inventory.edit', async () => {
    mockUseMembership.mockReturnValue(membership(perms({ edit: true })));
    renderDetail();
    fireEvent.click(await screen.findByLabelText(en.inventory.item.txn_more));
    expect(screen.getByRole('menuitem', { name: en.common.action.edit })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: en.common.action.delete })).not.toBeInTheDocument();
  });

  it('shows only Delete with inventory.delete', async () => {
    mockUseMembership.mockReturnValue(membership(perms({ delete: true })));
    renderDetail();
    fireEvent.click(await screen.findByLabelText(en.inventory.item.txn_more));
    expect(screen.queryByRole('menuitem', { name: en.common.action.edit })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: en.common.action.delete })).toBeInTheDocument();
  });

  it('Edit opens the edit dialog prefilled and saves through the replay data layer', async () => {
    mockUseMembership.mockReturnValue(membership(perms(), true));
    renderDetail();
    fireEvent.click(await screen.findByLabelText(en.inventory.item.txn_more));
    fireEvent.click(screen.getByRole('menuitem', { name: en.common.action.edit }));

    expect(screen.getByText(en.inventory.item.txn_edit_title)).toBeInTheDocument();
    const qty = screen.getByRole('textbox', { name: en.inventory.txn.quantity_label });
    expect(qty).toHaveValue('5');
    fireEvent.change(qty, { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));

    await waitFor(() =>
      expect(mockUpdateTxn).toHaveBeenCalledWith(
        expect.anything(),
        'b1',
        'item1',
        't1',
        { quantity: 4, unitPrice: 10, notes: null },
        'Basmati Rice',
      ),
    );
    expect(await screen.findByText(en.inventory.item.txn_update_success)).toBeInTheDocument();
  });

  it('a rejected edit shows the localized historical-negative error and keeps the dialog open', async () => {
    mockUseMembership.mockReturnValue(membership(perms(), true));
    mockUpdateTxn.mockRejectedValueOnce(new HistoricalNegativeStockError());
    renderDetail();
    fireEvent.click(await screen.findByLabelText(en.inventory.item.txn_more));
    fireEvent.click(screen.getByRole('menuitem', { name: en.common.action.edit }));
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));

    expect(
      await screen.findByText(en.inventory.item.txn_history_negative),
    ).toBeInTheDocument();
    expect(screen.getByText(en.inventory.item.txn_edit_title)).toBeInTheDocument();
  });

  it('Delete confirms, then delegates to the replay-aware delete', async () => {
    mockUseMembership.mockReturnValue(membership(perms(), true));
    renderDetail();
    fireEvent.click(await screen.findByLabelText(en.inventory.item.txn_more));
    fireEvent.click(screen.getByRole('menuitem', { name: en.common.action.delete }));

    expect(screen.getByText(en.inventory.item.txn_delete_title)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: en.common.action.delete }));

    await waitFor(() =>
      expect(mockDeleteTxn).toHaveBeenCalledWith(expect.anything(), 'b1', 'item1', 't1', 'Basmati Rice'),
    );
    expect(await screen.findByText(en.inventory.item.txn_delete_success)).toBeInTheDocument();
  });

  it('a rejected delete surfaces the localized error inside the confirm dialog', async () => {
    mockUseMembership.mockReturnValue(membership(perms(), true));
    mockDeleteTxn.mockRejectedValueOnce(new HistoricalNegativeStockError());
    renderDetail();
    fireEvent.click(await screen.findByLabelText(en.inventory.item.txn_more));
    fireEvent.click(screen.getByRole('menuitem', { name: en.common.action.delete }));
    fireEvent.click(screen.getByRole('button', { name: en.common.action.delete }));

    expect(
      await screen.findByText(en.inventory.item.txn_history_negative),
    ).toBeInTheDocument();
    // Confirm dialog stays open; nothing was applied.
    expect(screen.getByText(en.inventory.item.txn_delete_title)).toBeInTheDocument();
  });
});

describe('bottom Add/Remove bar', () => {
  it('is hidden without inventory.create', async () => {
    mockUseMembership.mockReturnValue(membership(perms()));
    renderDetail();
    await screen.findByText('Basmati Rice');
    expect(screen.queryByRole('button', { name: en.inventory.txn.add })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en.inventory.txn.remove })).not.toBeInTheDocument();
  });

  it('renders big primary/secondary buttons (inventory palette, not red/green)', async () => {
    mockUseMembership.mockReturnValue(membership(perms({ create: true })));
    renderDetail();
    const add = await screen.findByRole('button', { name: en.inventory.txn.add });
    const remove = screen.getByRole('button', { name: en.inventory.txn.remove });
    expect(add.className).toContain('MuiButton-containedPrimary');
    expect(remove.className).toContain('MuiButton-containedSecondary');
    expect(add.className).toContain('MuiButton-sizeLarge');
    expect(add.className).not.toContain('MuiButton-containedSuccess');
    expect(remove.className).not.toContain('MuiButton-containedError');
  });

  it('Add/Remove open the transaction dialog pre-set to the tapped direction', async () => {
    mockUseMembership.mockReturnValue(membership(perms({ create: true })));
    renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: en.inventory.txn.remove }));
    expect(screen.getByRole('combobox')).toHaveValue('Basmati Rice');
    expect(
      screen.getByRole('button', { name: en.inventory.txn.remove, pressed: true }),
    ).toBeInTheDocument();
  });
});
