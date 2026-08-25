'use client';

// Block dates flow (§4.1 overflow menu): create maintenance/closure blocks
// (rendered grey-striped on the calendar) and remove existing ones.

import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { formatDateRange } from '@/lib/booking/dates';
import type { DateBlock } from '@/lib/booking/types';

export default function BlockDatesDialog({
  blocks,
  onCreate,
  onRemove,
  onClose,
}: {
  blocks: DateBlock[];
  onCreate: (input: { start_date: string; end_date: string; reason: string | null }) => Promise<void>;
  onRemove: (blockId: string) => Promise<void>;
  onClose: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [dateError, setDateError] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (start === '' || end === '' || end < start) {
      setDateError(true);
      return;
    }
    setSaving(true);
    try {
      await onCreate({ start_date: start, end_date: end, reason: reason.trim() === '' ? null : reason.trim() });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('booking.calendar.block_dates')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Stack direction="row" spacing={1}>
            <TextField
              label={t('booking.form.start_date')}
              type="date"
              value={start}
              error={dateError}
              onChange={(e) => {
                setStart(e.target.value);
                if (end === '' || end < e.target.value) {
                  setEnd(e.target.value);
                }
                setDateError(false);
              }}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label={t('booking.form.end_date')}
              type="date"
              value={end}
              error={dateError}
              helperText={dateError ? t('booking.form.end_before_start') : undefined}
              onChange={(e) => {
                setEnd(e.target.value);
                setDateError(false);
              }}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Stack>
          <TextField
            label={t('booking.block.reason_label')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            fullWidth
          />
          {blocks.length > 0 ? (
            <>
              <Typography variant="subtitle2">{t('booking.calendar.blocked')}</Typography>
              <List dense disablePadding>
                {blocks.map((b) => (
                  <ListItem
                    key={b.id}
                    disableGutters
                    secondaryAction={
                      <Tooltip title={t('booking.block.remove')}>
                        <IconButton
                          edge="end"
                          aria-label={t('booking.block.remove')}
                          onClick={() => onRemove(b.id)}
                        >
                          <DeleteOutlineIcon />
                        </IconButton>
                      </Tooltip>
                    }
                  >
                    <ListItemText
                      primary={formatDateRange(b.start_date, b.end_date, locale)}
                      secondary={b.reason ?? t('booking.block.no_reason')}
                    />
                  </ListItem>
                ))}
              </List>
            </>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.action.cancel')}</Button>
        <Button variant="contained" onClick={submit} disabled={saving}>
          {t('common.action.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
