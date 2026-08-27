'use client';

import AttachFileIcon from '@mui/icons-material/AttachFile';
import CollectionsIcon from '@mui/icons-material/Collections';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
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
import { useEffect, useRef, useState } from 'react';
import ChipRow from '@/components/ChipRow';
import type { ExpenseDirection } from '@/lib/expenses/ledger';
import { parseAmount } from '@/lib/format/amount';
import { useBusiness } from '@/lib/hooks/useBusiness';
import {
  createExpense,
  deleteExpense,
  MAX_ATTACHMENTS_PER_ENTRY,
  updateExpense,
  type ExpenseRecord,
  type NewAttachmentInput,
} from '../_lib/queries';

interface EntryDialogProps {
  open: boolean;
  partyId: string;
  direction: ExpenseDirection;
  /** Present when editing an existing entry. */
  entry: ExpenseRecord | null;
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
 * Add/edit ledger entry dialog (spec §4.2): amount, date, notes, attachment
 * metadata rows (Google Drive upload is handled by the Drive integration —
 * rows stay in the pending state here), tombstone delete with confirmation.
 */
export default function EntryDialog({
  open,
  partyId,
  direction,
  entry,
  onClose,
  onSaved,
}: EntryDialogProps) {
  const t = useTranslations('expenses');
  const tCommon = useTranslations('common');
  const { supabase, businessId, userId } = useBusiness();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIsoDate());
  const [notes, setNotes] = useState('');
  const [newFiles, setNewFiles] = useState<NewAttachmentInput[]>([]);
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
    setNewFiles([]);
    setRemovedAttachmentIds([]);
    setAmountError(null);
    setSaveError(false);
    setSaving(false);
    setConfirmDelete(false);
  }, [open, entry]);

  const existingAttachments = (entry?.expense_attachments ?? []).filter(
    (a) => !removedAttachmentIds.includes(a.id),
  );
  const attachmentCount = existingAttachments.length + newFiles.length;

  const handleFilesPicked = (files: FileList | null) => {
    if (!files) {
      return;
    }
    const room = MAX_ATTACHMENTS_PER_ENTRY - attachmentCount;
    const picked = Array.from(files)
      .slice(0, Math.max(0, room))
      .map((file) => ({ fileName: file.name, mimeType: file.type || 'application/octet-stream' }));
    setNewFiles((prev) => [...prev, ...picked]);
  };

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
        await updateExpense(supabase, businessId, entry.id, input, newFiles, removedAttachmentIds);
      } else {
        await createExpense(supabase, businessId, partyId, userId, input, newFiles);
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
            {newFiles.map((file, index) => (
              <Chip
                key={`${file.fileName}-${index}`}
                icon={<AttachFileIcon />}
                label={`${file.fileName} — ${t('entry.attachment_pending')}`}
                color="warning"
                variant="outlined"
                onDelete={() => setNewFiles((prev) => prev.filter((_, i) => i !== index))}
              />
            ))}
          </Box>
          {/*
           * Attachment source pills (Camera / Gallery / PDF). ChipRow keeps
           * them on ONE horizontally-scrollable line — on 320px viewports
           * (and in Hindi) they must never wrap into a ragged second row.
           */}
          <ChipRow aria-label={t('entry.attach')} sx={{ mb: 0.5 }}>
            <Chip
              icon={<PhotoCameraIcon />}
              variant="outlined"
              clickable
              label={t('entry.attach_camera')}
              disabled={attachmentCount >= MAX_ATTACHMENTS_PER_ENTRY}
              onClick={() => cameraInputRef.current?.click()}
            />
            <Chip
              icon={<CollectionsIcon />}
              variant="outlined"
              clickable
              label={t('entry.attach_gallery')}
              disabled={attachmentCount >= MAX_ATTACHMENTS_PER_ENTRY}
              onClick={() => galleryInputRef.current?.click()}
            />
            <Chip
              icon={<PictureAsPdfIcon />}
              variant="outlined"
              clickable
              label={t('entry.attach_pdf')}
              disabled={attachmentCount >= MAX_ATTACHMENTS_PER_ENTRY}
              onClick={() => pdfInputRef.current?.click()}
            />
          </ChipRow>
          <Typography variant="caption" color="text.secondary" component="div">
            {t('entry.attachment_limit_hint', { max: MAX_ATTACHMENTS_PER_ENTRY })}
          </Typography>
          <input
            ref={cameraInputRef}
            type="file"
            hidden
            accept="image/*"
            capture="environment"
            aria-label={t('entry.attach_camera')}
            onChange={(event) => {
              handleFilesPicked(event.target.files);
              event.target.value = '';
            }}
          />
          <input
            ref={galleryInputRef}
            type="file"
            hidden
            multiple
            accept="image/*"
            aria-label={t('entry.attach_gallery')}
            onChange={(event) => {
              handleFilesPicked(event.target.files);
              event.target.value = '';
            }}
          />
          <input
            ref={pdfInputRef}
            type="file"
            hidden
            multiple
            accept="application/pdf"
            aria-label={t('entry.attach_pdf')}
            onChange={(event) => {
              handleFilesPicked(event.target.files);
              event.target.value = '';
            }}
          />
          {saveError && (
            <Typography variant="body2" color="error" sx={{ mt: 1 }}>
              {t('error.save_failed')}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          {entry && (
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
