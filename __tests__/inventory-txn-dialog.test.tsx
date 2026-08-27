// Record-transaction dialog: live total-price preview in add mode (qty ×
// unit price), item preselection + initial type (item detail entry points),
// and the saved payload carrying the FIFO cost of removes for the snackbar.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { SupabaseClient } from '@supabase/supabase-js';
import en from '../messages/en.json';
import RecordTransactionDialog from '@/app/[locale]/(app)/inventory/_components/RecordTransactionDialog';
import type { MasterItemRecord } from '@/app/[locale]/(app)/inventory/_lib/queries';

jest.mock('@/app/[locale]/(app)/inventory/_lib/queries', () => ({
  InsufficientStockError: class InsufficientStockError extends Error {},
  recordAddTransaction: jest.fn().mockResolvedValue(undefined),
  recordRemoveTransaction: jest.fn().mockResolvedValue(110),
}));

const item: MasterItemRecord = {
  id: 'item1',
  name: 'Basmati Rice',
  unit: 'kg',
  image_path: null,
  created_at: '2026-01-01T00:00:00Z',
};

function renderDialog(props: Partial<Parameters<typeof RecordTransactionDialog>[0]> = {}) {
  const onSaved = jest.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Kolkata">
      <RecordTransactionDialog
        open
        items={[item]}
        stockByItemId={new Map([[item.id, 10]])}
        supabase={{} as SupabaseClient}
        businessId="b1"
        userId="u1"
        onClose={() => {}}
        onSaved={onSaved}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onSaved };
}

describe('RecordTransactionDialog', () => {
  it('shows a live total-price preview once quantity and unit price parse (add mode)', () => {
    renderDialog({ preselectedItem: item });
    expect(screen.queryByText(/Total price:/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(en.inventory.txn.quantity_label), {
      target: { value: '3' },
    });
    fireEvent.change(screen.getByLabelText(en.inventory.txn.unit_price_label), {
      target: { value: '25.5' },
    });
    expect(screen.getByText('Total price: \u20B976.50')).toBeInTheDocument();
  });

  it('hides the preview while either field is invalid', () => {
    renderDialog({ preselectedItem: item });
    fireEvent.change(screen.getByLabelText(en.inventory.txn.quantity_label), {
      target: { value: '0' },
    });
    fireEvent.change(screen.getByLabelText(en.inventory.txn.unit_price_label), {
      target: { value: '25' },
    });
    expect(screen.queryByText(/Total price:/)).not.toBeInTheDocument();
  });

  it('opens pre-selected to the given item and initial type', () => {
    renderDialog({ preselectedItem: item, initialType: 'remove' });
    expect(screen.getByRole('combobox')).toHaveValue('Basmati Rice');
    expect(screen.getByRole('button', { name: en.inventory.txn.remove, pressed: true })).toBeInTheDocument();
    // Remove mode has no unit-price field.
    expect(screen.queryByLabelText(en.inventory.txn.unit_price_label)).not.toBeInTheDocument();
  });

  it('passes the FIFO removed cost to onSaved for removes', async () => {
    const { onSaved } = renderDialog({ preselectedItem: item, initialType: 'remove' });
    fireEvent.change(screen.getByLabelText(en.inventory.txn.quantity_label), {
      target: { value: '8' },
    });
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith({
        type: 'remove',
        itemName: 'Basmati Rice',
        removedValue: 110,
      }),
    );
  });

  it('passes the item name to onSaved for adds', async () => {
    const { onSaved } = renderDialog({ preselectedItem: item });
    fireEvent.change(screen.getByLabelText(en.inventory.txn.quantity_label), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText(en.inventory.txn.unit_price_label), {
      target: { value: '10' },
    });
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith({ type: 'add', itemName: 'Basmati Rice' }),
    );
  });
});
