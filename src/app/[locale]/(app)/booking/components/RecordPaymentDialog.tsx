'use client';

// Record payment sheet (§4.1): amount pre-filled with the current due,
// date defaults to today, method chips, notes → appends to booking_payments.

import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import ChipRow from '@/components/ChipRow';
import TextField from '@mui/material/TextField';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { todayIso } from '@/lib/booking/calendar';
import { parseAmount } from '@/lib/booking/money';
import type { PaymentMethod } from '@/lib/booking/types';

const METHODS: PaymentMethod[] = ['cash', 'upi', 'bank_transfer', 'cheque', 'other'];

export default function RecordPaymentDialog({
  due,
  onSave,
  onClose,
}: {
  due: number;
  onSave: (input: { amount: number; paid_on: string; method: PaymentMethod; notes: string | null }) => Promise<void>;
  onClose: () => void;
}) {
  const t = useTranslations('booking.payment');
  const tc = useTranslations('common.action');
  const tCard = useTranslations('booking.card');
  const tForm = useTranslations('booking.form');
  const [amount, setAmount] = useState(due > 0 ? String(due) : '');
  const [date, setDate] = useState(todayIso());
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit() {
    const parsed = parseAmount(amount);
    if (parsed === null || parsed <= 0 || date === '') {
      setError(true);
      return;
    }
    setSaving(true);
    try {
      await onSave({ amount: parsed, paid_on: date, method, notes: notes.trim() === '' ? null : notes.trim() });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{tCard('action_record_payment')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label={t('amount')}
            value={amount}
            error={error}
            helperText={error ? t('invalid_amount') : undefined}
            onChange={(e) => {
              setAmount(e.target.value);
              setError(false);
            }}
            inputProps={{ inputMode: 'decimal' }}
            autoFocus
            fullWidth
          />
          <TextField
            label={t('date')}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <ChipRow aria-label={t('method')}>
            {METHODS.map((m) => (
              <Chip
                key={m}
                label={t(`method_${m}`)}
                variant={method === m ? 'filled' : 'outlined'}
                color={method === m ? 'primary' : 'default'}
                onClick={() => setMethod(m)}
              />
            ))}
          </ChipRow>
          <TextField
            label={tForm('notes')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tc('cancel')}</Button>
        <Button variant="contained" onClick={submit} disabled={saving}>
          {tc('save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
