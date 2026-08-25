'use client';

import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatIndianNumber } from '@/lib/format/amount';
import { FUZZY_MIN_QUERY_LENGTH, findSimilarItems } from '@/lib/fuzzy';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { canRemoveQuantity, type TransactionType } from '@/lib/inventory/fifo';
import {
  InsufficientStockError,
  recordAddTransaction,
  recordRemoveTransaction,
  type MasterItemRecord,
} from '../_lib/queries';
import { isBuiltInUnit, unitLabelKey } from '../_lib/units';

interface RecordTransactionDialogProps {
  open: boolean;
  items: MasterItemRecord[];
  /** Current FIFO stock per master item id — remove validation. */
  stockByItemId: Map<string, number>;
  supabase: SupabaseClient | null;
  businessId: string | null;
  userId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Record-transaction dialog (spec §4.3): 300ms-debounced fuzzy item
 * type-ahead, Add/Remove toggle, quantity, unit price (add only), notes.
 * Validation: cannot remove more than the current stock.
 */
export default function RecordTransactionDialog({
  open,
  items,
  stockByItemId,
  supabase,
  businessId,
  userId,
  onClose,
  onSaved,
}: RecordTransactionDialogProps) {
  const t = useTranslations('inventory');
  const tCommon = useTranslations('common');

  const [txnType, setTxnType] = useState<TransactionType>('add');
  const [selectedItem, setSelectedItem] = useState<MasterItemRecord | null>(null);
  const [itemQuery, setItemQuery] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const debouncedQuery = useDebouncedValue(itemQuery);

  useEffect(() => {
    if (!open) {
      return;
    }
    setTxnType('add');
    setSelectedItem(null);
    setItemQuery('');
    setQuantity('');
    setUnitPrice('');
    setNotes('');
    setFieldError(null);
    setSaveError(false);
    setSaving(false);
  }, [open]);

  const unitLabel = useCallback(
    (unit: string) => (isBuiltInUnit(unit) ? t(`master.${unitLabelKey(unit)}`) : unit),
    [t],
  );

  /**
   * Debounced fuzzy suggestions: full fuzzy scoring from 3 chars, plain
   * substring narrowing below that, everything when the field is empty.
   */
  const options = useMemo(() => {
    const query = debouncedQuery.trim();
    if (query.length >= FUZZY_MIN_QUERY_LENGTH) {
      const matches = findSimilarItems(query, items, 0.4, 10);
      return matches.length > 0 ? matches.map((m) => m.item) : [];
    }
    if (query.length > 0) {
      const lower = query.toLowerCase();
      return items.filter((item) => item.name.toLowerCase().includes(lower));
    }
    return items;
  }, [debouncedQuery, items]);

  const selectedStock = selectedItem ? (stockByItemId.get(selectedItem.id) ?? 0) : 0;

  const handleSave = async () => {
    if (!selectedItem) {
      setFieldError({ field: 'item', message: t('txn.item_required') });
      return;
    }
    const qty = Number.parseFloat(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setFieldError({ field: 'quantity', message: t('txn.quantity_invalid') });
      return;
    }
    if (txnType === 'remove' && !canRemoveQuantity(selectedStock, qty)) {
      setFieldError({
        field: 'quantity',
        message: t('txn.insufficient_stock', {
          qty: formatIndianNumber(selectedStock),
          unit: unitLabel(selectedItem.unit),
        }),
      });
      return;
    }
    let price = 0;
    if (txnType === 'add') {
      price = Number.parseFloat(unitPrice);
      if (!Number.isFinite(price) || price < 0) {
        setFieldError({ field: 'price', message: t('txn.price_invalid') });
        return;
      }
    }
    if (!supabase || !businessId || !userId) {
      setSaveError(true);
      return;
    }
    setSaving(true);
    setSaveError(false);
    try {
      if (txnType === 'add') {
        await recordAddTransaction(
          supabase,
          businessId,
          userId,
          selectedItem.id,
          qty,
          price,
          notes.trim() || null,
        );
      } else {
        await recordRemoveTransaction(
          supabase,
          businessId,
          userId,
          selectedItem.id,
          qty,
          notes.trim() || null,
        );
      }
      onSaved();
    } catch (error) {
      if (error instanceof InsufficientStockError) {
        setFieldError({
          field: 'quantity',
          message: t('txn.insufficient_stock', {
            qty: formatIndianNumber(selectedStock),
            unit: unitLabel(selectedItem.unit),
          }),
        });
      } else {
        setSaveError(true);
      }
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('stock.record_transaction')}</DialogTitle>
      <DialogContent>
        <ToggleButtonGroup
          exclusive
          fullWidth
          color={txnType === 'add' ? 'success' : 'error'}
          value={txnType}
          onChange={(_, value: TransactionType | null) => {
            if (value) {
              setTxnType(value);
              setFieldError(null);
            }
          }}
          sx={{ my: 1 }}
        >
          <ToggleButton value="add">{t('txn.add')}</ToggleButton>
          <ToggleButton value="remove">{t('txn.remove')}</ToggleButton>
        </ToggleButtonGroup>

        <Autocomplete
          options={options}
          getOptionLabel={(option) => option.name}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          // Fuzzy filtering happens in `options` (debounced) — disable the built-in filter.
          filterOptions={(x) => x}
          noOptionsText={t('txn.no_matches')}
          value={selectedItem}
          onChange={(_, value) => {
            setSelectedItem(value);
            setFieldError(null);
          }}
          inputValue={itemQuery}
          onInputChange={(_, value) => setItemQuery(value)}
          renderInput={(params) => (
            <TextField
              {...params}
              autoFocus
              margin="normal"
              label={t('txn.item_label')}
              error={fieldError?.field === 'item'}
              helperText={
                fieldError?.field === 'item'
                  ? fieldError.message
                  : selectedItem
                    ? t('txn.current_stock', {
                        qty: formatIndianNumber(selectedStock),
                        unit: unitLabel(selectedItem.unit),
                      })
                    : ' '
              }
            />
          )}
        />

        <TextField
          fullWidth
          margin="normal"
          label={t('txn.quantity_label')}
          inputProps={{ inputMode: 'decimal', 'aria-label': t('txn.quantity_label') }}
          value={quantity}
          error={fieldError?.field === 'quantity'}
          helperText={fieldError?.field === 'quantity' ? fieldError.message : ' '}
          onChange={(event) => {
            setQuantity(event.target.value);
            setFieldError(null);
          }}
        />

        {txnType === 'add' && (
          <TextField
            fullWidth
            margin="normal"
            label={t('txn.unit_price_label')}
            inputProps={{ inputMode: 'decimal', 'aria-label': t('txn.unit_price_label') }}
            value={unitPrice}
            error={fieldError?.field === 'price'}
            helperText={fieldError?.field === 'price' ? fieldError.message : ' '}
            onChange={(event) => {
              setUnitPrice(event.target.value);
              setFieldError(null);
            }}
          />
        )}

        <TextField
          fullWidth
          margin="normal"
          multiline
          minRows={2}
          label={t('txn.notes_label')}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />

        {saveError && (
          <Typography variant="body2" color="error">
            {t('error.save_failed')}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tCommon('action.cancel')}</Button>
        <Button variant="contained" disabled={saving} onClick={handleSave}>
          {tCommon('action.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
