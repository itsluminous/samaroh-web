'use client';

import AttachFileIcon from '@mui/icons-material/AttachFile';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { ExpenseDirection } from '@/lib/expenses/ledger';
import { parseAmount } from '@/lib/format/amount';
import { useBusiness } from '@/lib/hooks/useBusiness';
import {
  createExpense,
  deleteExpense,
  updateExpense,
  type ExpenseRecord,
} from '../_lib/queries';

interface EntryDialogProps {
  open: boolean;
  partyId: string;
  direction: ExpenseDirection;
  /** Present when editing an existing entry. */
  entry: ExpenseRecord | null;
  /** expenses.delete — hides the tombstone-delete affordance when absent. */
  canDelete: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Add/edit ledger entry dialog (spec §4.2): amount, date, notes, tombstone
 * delete with confirmation. Attachments are DISPLAY + REMOVE only on web:
 * bill files are uploaded to Google Drive by the Android app, and the web app
 * has no Drive upload path — a picker here would silently discard the bytes
 * (metadata-only rows stay "pending" forever), so instead a localized
 * "attach from the mobile app" hint is shown (the inventory-photo precedent;
 * see docs/decisions.md).
 */
export default function EntryDialog({
  open,
  partyId,
  direction,
  entry,
  canDelete,
  onClose,
  onSaved,
}: EntryDialogProps) {
  const t = useTranslations('expenses');
  const tCommon = useTranslations('common');
  const { supabase, businessId, userId } = useBusiness();

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIsoDate());
  const [notes, setNotes] = useState('');
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>([]);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setAmount(entry ? String(entry.amount) : '');
    setDate(entry ? entry.expense_date : todayIsoDate());
    setNotes(entry?.notes ?? '');
    setRemovedAttachmentIds([]);
    setAmountError(null);
    setSaveError(false);
    setSaving(false);
    setConfirmDelete(false);
  }, [open, entry]);

  const existingAttachments = (entry?.expense_attachments ?? []).filter(
    (a) => !removedAttachmentIds.includes(a.id),
  );

  const handleSave = async () => {
    const parsed = parseAmount(amount);
    if (parsed === null) {
      setAmountError(t('entry.amount_invalid'));
      return;
    }
    if (!supabase || !businessId || !userId) {
      setSaveError(true);
      return;
    }
    setSaving(true);
    setSaveError(false);
    try {
      const input = {
        direction,
        amount: parsed,
        expenseDate: date,
        notes: notes.trim() || null,
      };
      if (entry) {
        await updateExpense(supabase, entry.id, input, removedAttachmentIds);
      } else {
        await createExpense(supabase, businessId, partyId, userId, input);
      }
      onSaved();
    } catch {
      setSaveError(true);
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!supabase || !entry) {
      return;
    }
    setSaving(true);
    setSaveError(false);
    try {
      await deleteExpense(supabase, entry.id);
      onSaved();
    } catch {
      setSaveError(true);
      setSaving(false);
      setConfirmDelete(false);
    }
  };

  const title = entry
    ? t('entry.edit_title')
    : direction === 'paid'
      ? t('home.you_gave')
      : t('home.you_got');

  return (
    <>
      <Dialog open={open && !confirmDelete} onClose={onClose} fullWidth maxWidth="xs">
        <DialogTitle
          sx={{ color: direction === 'paid' ? 'error.main' : 'success.main' }}
        >
          {title}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="normal"
            label={t('entry.amount_label')}
            inputProps={{ inputMode: 'decimal', 'aria-label': t('entry.amount_label') }}
            value={amount}
            error={amountError !== null}
            helperText={amountError ?? ' '}
            onChange={(event) => {
              setAmount(event.target.value);
              setAmountError(null);
            }}
          />
          <TextField
            fullWidth
            margin="normal"
            type="date"
            label={t('entry.date_label')}
            InputLabelProps={{ shrink: true }}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          <TextField
            fullWidth
            margin="normal"
            multiline
            minRows={2}
            label={t('entry.notes_label')}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />

          <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
            {t('entry.attachments_label')}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, my: 1 }}>
            {existingAttachments.map((attachment) => (
              <Chip
                key={attachment.id}
                icon={<AttachFileIcon />}
                label={
                  attachment.drive_file_id === null
                    ? `${attachment.file_name} — ${t('entry.attachment_pending')}`
                    : attachment.file_name
                }
                color={attachment.drive_file_id === null ? 'warning' : 'default'}
                variant="outlined"
                onDelete={() =>
                  setRemovedAttachmentIds((prev) => [...prev, attachment.id])
                }
              />
            ))}
          </Box>
          {/*
           * No picker on web: the file bytes would have nowhere to go (Drive
           * uploads are the Android app's pipeline), so we show the same
           * "use the mobile app" hint the inventory photo section uses
           * instead of a silently-lossy picker.
           */}
          <Typography variant="body2" color="text.secondary">
            {t('entry.attachments_mobile_hint')}
          </Typography>
          {saveError && (
            <Typography variant="body2" color="error" sx={{ mt: 1 }}>
              {t('error.save_failed')}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          {entry && canDelete && (
            <Button color="error" onClick={() => setConfirmDelete(true)} sx={{ mr: 'auto' }}>
              {tCommon('action.delete')}
            </Button>
          )}
          <Button onClick={onClose}>{tCommon('action.cancel')}</Button>
          <Button variant="contained" disabled={saving} onClick={handleSave}>
            {tCommon('action.save')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={open && confirmDelete} onClose={() => setConfirmDelete(false)} maxWidth="xs">
        <DialogTitle>{t('entry.delete_title')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('entry.delete_message')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(false)}>{tCommon('action.cancel')}</Button>
          <Button color="error" variant="contained" disabled={saving} onClick={handleDelete}>
            {tCommon('action.delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
