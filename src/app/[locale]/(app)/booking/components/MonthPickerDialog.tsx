'use client';

// Year/month picker for the calendar header (§4.1).

import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { formatMonthName } from '@/lib/booking/dates';

export default function MonthPickerDialog({
  year,
  month0,
  onPick,
  onClose,
}: {
  year: number;
  month0: number;
  onPick: (year: number, month0: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations('booking.calendar');
  const locale = useLocale();
  const [viewYear, setViewYear] = useState(year);

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('pick_month')}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, mb: 1 }}>
          <IconButton aria-label={t('prev_year')} onClick={() => setViewYear((y) => y - 1)}>
            <ChevronLeftIcon />
          </IconButton>
          <Typography variant="h6">{String(viewYear)}</Typography>
          <IconButton aria-label={t('next_year')} onClick={() => setViewYear((y) => y + 1)}>
            <ChevronRightIcon />
          </IconButton>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
          {Array.from({ length: 12 }, (_, m) => (
            <Button
              key={m}
              variant={viewYear === year && m === month0 ? 'contained' : 'text'}
              onClick={() => onPick(viewYear, m)}
            >
              {formatMonthName(m, locale)}
            </Button>
          ))}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
