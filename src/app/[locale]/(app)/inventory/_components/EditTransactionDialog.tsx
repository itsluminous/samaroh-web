'use client';

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import {
  HistoricalNegativeStockError,
  updateInventoryTransaction,
  type ItemTransactionRecord,
} from '../_lib/queries';

interface EditTransactionDialogProps {
  open: boolean;
  /** The transaction being edited (row-menu Edit); null while closed. */
  transaction: ItemTransactionRecord | null;
  supabase: SupabaseClient | null;
  businessId: string | null;
  itemId: string;
  itemName: string;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Edit-transaction dialog (item-detail row menu): quantity, unit price
 * (add transactions only — a remove's price is FIFO-derived), notes. Saving
 * replays the item's whole history (spec §4.3 FIFO): every add lot's
 * remaining_quantity and every remove's cost-per-unit are rewritten via the
 * outbox-aware update path. An edit that would drive historical stock
 * negative is rejected with a localized error and persists nothing.
 */
export default function EditTransactionDialog({
  open,
  transaction,
  supabase,
  businessId,
  itemId,
  itemName,
  onClose,
  onSaved,
}: EditTransactionDialogProps) {
  const t = useTranslations('inventory');
  const tCommon = useTranslations('common');

  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !transaction) {
      return;
    }
    setQuantity(String(transaction.quantity));
    setUnitPrice(String(transaction.unitPrice));
    setNotes(transaction.notes ?? '');
    setFieldError(null);
    setSaveError(null);
    setSaving(false);
  }, [open, transaction]);

  const isAdd = transaction?.transactionType === 'add';

  const handleSave = async () => {
    if (!transaction) {
      return;
    }
    const qty = Number.parseFloat(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setFieldError({ field: 'quantity', message: t('txn.quantity_invalid') });
      return;
    }
    let price: number | undefined;
    if (isAdd) {
      price = Number.parseFloat(unitPrice);
      if (!Number.isFinite(price) || price < 0) {
        setFieldError({ field: 'price', message: t('txn.price_invalid') });
        return;
      }
    }
    if (!supabase || !businessId) {
      setSaveError(t('error.save_failed'));
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await updateInventoryTransaction(
        supabase,
        businessId,
        itemId,
        transaction.id,
        { quantity: qty, unitPrice: price, notes: notes.trim() || null },
        itemName,
      );
      onSaved();
    } catch (error) {
      setSaveError(
        error instanceof HistoricalNegativeStockError
          ? t('item.txn_history_negative')
          : t('error.save_failed'),
      );
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('item.txn_edit_title')}</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          autoFocus
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

        {isAdd && (
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
            {saveError}
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
