'use client';

/**
 * New-folder / rename-folder dialog (design §6): one text field, validation
 * mirroring the server CHECK + unique index (required / invalid / duplicate
 * against LIVE siblings case-insensitively). Pure validation lives in
 * `_lib/tree.ts` (`validateFolderName`).
 */
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { type FolderNameError, validateFolderName } from '../_lib/tree';
import type { FolderRecord } from '../_lib/types';

export default function FolderNameDialog({
  open,
  mode,
  initialName,
  siblings,
  selfId,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: 'create' | 'rename';
  initialName?: string;
  /** Live folders in the same parent (duplicate check). */
  siblings: readonly FolderRecord[];
  /** The folder being renamed (excluded from the duplicate check). */
  selfId?: string | null;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const t = useTranslations('files');
  const tCommon = useTranslations('common');
  const [name, setName] = useState(initialName ?? '');
  const [error, setError] = useState<FolderNameError | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initialName ?? '');
      setError(null);
      setSaving(false);
    }
  }, [open, initialName]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const validation = validateFolderName(name, siblings, selfId ?? null);
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    try {
      await onSubmit(name.trim());
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <form onSubmit={handleSubmit}>
        <DialogTitle>{mode === 'create' ? t('action.new_folder') : t('action.rename_folder')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label={t('folder.name_label')}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            error={error !== null}
            helperText={error ? t(`folder.${error}`) : ' '}
            slotProps={{ htmlInput: { maxLength: 120 } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={saving}>
            {tCommon('action.cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={saving}>
            {tCommon('action.save')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
