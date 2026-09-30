'use client';

/**
 * Rename-file dialog (owner feedback 2026-09-30): one text field prefilled
 * with the current display name (incl. extension), validation mirroring the
 * server CHECK on files.name (required / no '/' / ≤ 255). File names may
 * repeat within a folder (D12), so there is no duplicate check. Pure
 * validation lives in `_lib/tree.ts` (`validateFileName`).
 */
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { compactDialogProps } from '../_lib/dialogSx';
import { FILE_NAME_MAX, type FileNameError, validateFileName } from '../_lib/tree';

export default function FileNameDialog({
  open,
  initialName,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initialName?: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const t = useTranslations('files');
  const tCommon = useTranslations('common');
  const [name, setName] = useState(initialName ?? '');
  const [error, setError] = useState<FileNameError | null>(null);
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
    const validation = validateFileName(name);
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
    <Dialog open={open} onClose={onClose} {...compactDialogProps}>
      <form onSubmit={handleSubmit}>
        <DialogTitle>{t('action.rename_file')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label={t('file.name_label')}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            error={error !== null}
            helperText={error ? t(`file.${error}`) : ' '}
            slotProps={{ htmlInput: { maxLength: FILE_NAME_MAX } }}
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
