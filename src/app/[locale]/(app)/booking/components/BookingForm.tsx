'use client';

// Add/Edit booking form (§4.1): built-in event types from
// shared/event-types.json, live auto-calculated due, non-blocking conflict
// warning, blocking date-block gate with owner override, advance → first
// payment (add mode only).

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import ChipRow from '@/components/ChipRow';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { computePaid } from '@/lib/booking/due';
import { CUSTOM_EVENT_TYPE_KEY, EVENT_TYPES, findEventType, isBuiltInEventType } from '@/lib/booking/eventTypes';
import { formatRupees, parseAmount } from '@/lib/booking/money';
import type { BookingInput } from '@/lib/booking/repo';
import type { Booking, BookingPayment, BookingSource, BookingStatus } from '@/lib/booking/types';

const SOURCES: BookingSource[] = ['walk_in', 'phone', 'referral', 'repeat'];

export interface OverlapCheck {
  conflictCount: number;
  blocked: boolean;
}

export default function BookingForm({
  mode,
  initial,
  initialDate,
  payments,
  isOwner,
  onCheckOverlaps,
  onSave,
  onClose,
}: {
  mode: 'add' | 'edit';
  initial: Booking | null;
  /** Pre-selected start AND end date when opened from an empty calendar day. */
  initialDate: string | null;
  payments: BookingPayment[];
  isOwner: boolean;
  onCheckOverlaps: (start: string, end: string, excludeId?: string) => Promise<OverlapCheck>;
  onSave: (input: BookingInput, advance: number) => Promise<void>;
  onClose: () => void;
}) {
  const t = useTranslations();

  const initialTypeKey =
    initial === null
      ? (EVENT_TYPES[0]?.key ?? CUSTOM_EVENT_TYPE_KEY)
      : isBuiltInEventType(initial.event_type)
        ? initial.event_type
        : CUSTOM_EVENT_TYPE_KEY;

  const [typeKey, setTypeKey] = useState(initialTypeKey);
  const [customLabel, setCustomLabel] = useState(
    initial !== null && !isBuiltInEventType(initial.event_type) ? initial.event_type : '',
  );
  const [customEmoji, setCustomEmoji] = useState(
    initial !== null && !isBuiltInEventType(initial.event_type) ? initial.event_icon : '\u2728',
  );
  const [status, setStatus] = useState<BookingStatus>(initial?.status ?? 'confirmed');
  const [name, setName] = useState(initial?.customer_name ?? '');
  const [phone, setPhone] = useState(initial?.customer_phone ?? '');
  const [startDate, setStartDate] = useState(initial?.start_date ?? initialDate ?? '');
  const [endDate, setEndDate] = useState(initial?.end_date ?? initialDate ?? '');
  const [startTime, setStartTime] = useState(initial?.start_time?.slice(0, 5) ?? '');
  const [endTime, setEndTime] = useState(initial?.end_time?.slice(0, 5) ?? '');
  const [total, setTotal] = useState(initial ? String(initial.total_amount) : '');
  const [deposit, setDeposit] = useState(
    initial && initial.security_deposit > 0 ? String(initial.security_deposit) : '',
  );
  const [advance, setAdvance] = useState('');
  const [source, setSource] = useState<BookingSource | null>(initial?.source ?? null);
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const [nameError, setNameError] = useState(false);
  const [dateError, setDateError] = useState(false);
  const [amountError, setAmountError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflictCount, setConflictCount] = useState<number | null>(null);
  const [blockedGate, setBlockedGate] = useState(false);

  const paidSoFar = mode === 'edit' ? computePaid(payments) : (parseAmount(advance || '0') ?? 0);
  const totalNum = parseAmount(total || '0') ?? 0;
  const due = useMemo(
    () => (Math.round(totalNum * 100) - Math.round(paidSoFar * 100)) / 100,
    [totalNum, paidSoFar],
  );

  function buildInput(): BookingInput | null {
    if (name.trim() === '') {
      setNameError(true);
      return null;
    }
    if (startDate === '' || endDate === '' || endDate < startDate) {
      setDateError(true);
      return null;
    }
    const totalParsed = parseAmount(total === '' ? '0' : total);
    const depositParsed = parseAmount(deposit === '' ? '0' : deposit);
    const advanceParsed = parseAmount(advance === '' ? '0' : advance);
    if (totalParsed === null || depositParsed === null || advanceParsed === null) {
      setAmountError(true);
      return null;
    }
    const custom = typeKey === CUSTOM_EVENT_TYPE_KEY;
    const builtIn = findEventType(typeKey);
    return {
      event_type: custom ? (customLabel.trim() === '' ? t('booking.event_type.custom') : customLabel.trim()) : typeKey,
      event_icon: custom ? customEmoji || '\u2728' : (builtIn?.emoji ?? '\u2728'),
      customer_name: name.trim(),
      customer_phone: phone.trim() === '' ? null : phone.trim(),
      start_date: startDate,
      end_date: endDate,
      start_time: startTime === '' ? null : startTime,
      end_time: endTime === '' ? null : endTime,
      total_amount: totalParsed,
      security_deposit: depositParsed,
      source,
      notes: notes.trim() === '' ? null : notes.trim(),
      status,
    };
  }

  async function save(input: BookingInput) {
    setSaving(true);
    try {
      await onSave(input, mode === 'add' ? (parseAmount(advance === '' ? '0' : advance) ?? 0) : 0);
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    const input = buildInput();
    if (!input) {
      return;
    }
    setSaving(true);
    try {
      const overlap = await onCheckOverlaps(input.start_date, input.end_date, initial?.id);
      if (overlap.blocked) {
        setBlockedGate(true);
        setSaving(false);
        return;
      }
      if (overlap.conflictCount > 0) {
        setConflictCount(overlap.conflictCount);
        setSaving(false);
        return;
      }
    } catch {
      // Overlap check is best-effort; never lose a booking because it failed.
    }
    await save(input);
  }

  async function forceSave() {
    const input = buildInput();
    if (input) {
      setConflictCount(null);
      setBlockedGate(false);
      await save(input);
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {mode === 'edit' ? t('booking.form.title_edit') : t('booking.calendar.add')}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            select
            label={t('booking.form.event_type')}
            value={typeKey}
            onChange={(e) => setTypeKey(e.target.value)}
            fullWidth
          >
            {EVENT_TYPES.map((et) => {
              const optionLabel = `${et.emoji} ${t(et.label_key)}`;
              return (
                <MenuItem key={et.key} value={et.key}>
                  {optionLabel}
                </MenuItem>
              );
            })}
          </TextField>
          {typeKey === CUSTOM_EVENT_TYPE_KEY ? (
            <Stack direction="row" spacing={1}>
              <TextField
                label={t('booking.form.custom_emoji')}
                value={customEmoji}
                onChange={(e) => setCustomEmoji(e.target.value)}
                sx={{ width: 96 }}
                inputProps={{ maxLength: 4 }}
              />
              <TextField
                label={t('booking.form.custom_label')}
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                fullWidth
              />
            </Stack>
          ) : null}

          <ToggleButtonGroup
            exclusive
            value={status}
            onChange={(_, v: BookingStatus | null) => v !== null && setStatus(v)}
            size="small"
            aria-label={t('booking.form.status')}
          >
            <ToggleButton value="confirmed">{t('booking.status.confirmed')}</ToggleButton>
            <ToggleButton value="tentative">{t('booking.status.tentative')}</ToggleButton>
          </ToggleButtonGroup>

          <TextField
            label={t('booking.form.customer_name')}
            value={name}
            required
            error={nameError}
            helperText={nameError ? t('booking.form.name_required') : undefined}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(false);
            }}
            fullWidth
          />
          <TextField
            label={t('booking.form.customer_phone')}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            type="tel"
            fullWidth
          />

          <Stack direction="row" spacing={1}>
            <TextField
              label={t('booking.form.start_date')}
              type="date"
              value={startDate}
              error={dateError}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (endDate === '' || endDate < e.target.value) {
                  setEndDate(e.target.value);
                }
                setDateError(false);
              }}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label={t('booking.form.end_date')}
              type="date"
              value={endDate}
              error={dateError}
              helperText={dateError ? t('booking.form.end_before_start') : undefined}
              onChange={(e) => {
                setEndDate(e.target.value);
                setDateError(false);
              }}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Stack>
          <Stack direction="row" spacing={1}>
            <TextField
              label={t('booking.form.start_time')}
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label={t('booking.form.end_time')}
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Stack>

          <Stack direction="row" spacing={1}>
            <TextField
              label={t('booking.form.total_amount')}
              value={total}
              error={amountError}
              onChange={(e) => {
                setTotal(e.target.value);
                setAmountError(false);
              }}
              inputProps={{ inputMode: 'decimal' }}
              fullWidth
            />
            <TextField
              label={t('booking.form.security_deposit')}
              value={deposit}
              error={amountError}
              onChange={(e) => {
                setDeposit(e.target.value);
                setAmountError(false);
              }}
              inputProps={{ inputMode: 'decimal' }}
              fullWidth
            />
          </Stack>
          {mode === 'add' ? (
            <TextField
              label={t('booking.form.advance')}
              value={advance}
              error={amountError}
              helperText={amountError ? t('booking.payment.invalid_amount') : undefined}
              onChange={(e) => {
                setAdvance(e.target.value);
                setAmountError(false);
              }}
              inputProps={{ inputMode: 'decimal' }}
              fullWidth
            />
          ) : null}
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography color="text.secondary">{t('booking.form.due_auto')}</Typography>
            <Typography fontWeight={700} color={due > 0 ? 'error.main' : 'success.main'}>
              {formatRupees(Math.max(due, 0))}
            </Typography>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>
              {t('booking.form.source')}
            </Typography>
            <ChipRow>
              {SOURCES.map((s) => (
                <Chip
                  key={s}
                  label={t(`booking.source.${s}`)}
                  variant={source === s ? 'filled' : 'outlined'}
                  color={source === s ? 'primary' : 'default'}
                  onClick={() => setSource(source === s ? null : s)}
                />
              ))}
            </ChipRow>
          </Box>

          <TextField
            label={t('booking.form.notes')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            minRows={2}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.action.cancel')}</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving}>
          {t('common.action.save')}
        </Button>
      </DialogActions>

      {/* Non-blocking conflict warning — halls can host multiple events. */}
      <Dialog open={conflictCount !== null} onClose={() => setConflictCount(null)}>
        <DialogTitle>{t('booking.form.conflict_title')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('booking.form.conflict_message', { count: conflictCount ?? 0 })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConflictCount(null)}>{t('booking.form.conflict_go_back')}</Button>
          <Button variant="contained" onClick={forceSave}>
            {t('booking.form.conflict_save_anyway')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Blocked dates DO block — override only for owners. */}
      <Dialog open={blockedGate} onClose={() => setBlockedGate(false)}>
        <DialogTitle>{t('booking.form.blocked_title')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('booking.form.blocked_message')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBlockedGate(false)}>{t('common.action.cancel')}</Button>
          {isOwner ? (
            <Button color="error" onClick={forceSave}>
              {t('booking.form.blocked_override')}
            </Button>
          ) : null}
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
