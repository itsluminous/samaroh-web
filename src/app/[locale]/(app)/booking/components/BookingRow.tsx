'use client';

// One booking row, shared by the month agenda, the full events view and the
// day chooser: background tinted by the resolved booking colour (explicit
// bookings.color → event-type default → themed), tentative kept visually
// distinct (amber outline, like the calendar pills), cancelled struck through.

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import { alpha } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material/styles';
import { useLocale, useTranslations } from 'next-intl';
import { maskAmount } from '@/components/MaskedAmount';
import { computeDue } from '@/lib/booking/due';
import { pillPaint, type PillPaint } from '@/lib/booking/bookingColors';
import { presetKindForType, type EventTypePreset } from '@/lib/booking/eventTypePresets';
import { formatDateRange } from '@/lib/booking/dates';
import { formatRupees } from '@/lib/booking/money';
import type { Booking, BookingPayment } from '@/lib/booking/types';
import { formatBookingTitle } from './format';

const TINT = 0.16;

/** Translucent tint of a palette token, dark-mode-correct via CSS vars channels. */
function paletteTint(token: 'primary' | 'warning', opacity: number) {
  return (t: Theme) =>
    t.vars
      ? `rgba(${t.vars.palette[token].mainChannel} / ${opacity})`
      : alpha(t.palette[token].main, opacity);
}

/** Row surface styling for a paint kind (exported for the colour-mapping tests). */
export function rowSurfaceSx(paint: PillPaint, cancelled: boolean): SxProps<Theme> {
  const base: SxProps<Theme> =
    paint.kind === 'custom'
      ? { bgcolor: alpha(paint.bg, TINT) }
      : paint.kind === 'tentative'
        ? {
            border: 1,
            borderColor: 'warning.main',
            bgcolor: paletteTint('warning', 0.08),
          }
        : { bgcolor: paletteTint('primary', 0.08) };
  return cancelled ? { ...base, opacity: 0.65 } : base;
}

export default function BookingRow({
  booking,
  payments,
  presets,
  showAmounts = true,
  onClick,
}: {
  booking: Booking;
  payments: BookingPayment[];
  /** Live event-type presets for type-default colour resolution (null = static fallback). */
  presets?: EventTypePreset[] | null;
  /** false = booking.view_amounts denied — the due chip amount renders as ₹•••. */
  showAmounts?: boolean;
  onClick: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const cancelled = booking.status === 'cancelled';
  const due = computeDue(booking.total_amount, payments);
  const paint = pillPaint(booking, presets);
  // Marker-kind bookings (Lagan/Tilak day indicators) carry no payment
  // status: no due / fully-paid chip (parity with Android).
  const marker = presetKindForType(presets, booking.event_type) === 'marker';

  return (
    <ListItemButton
      onClick={onClick}
      sx={{
        px: 1,
        mb: 0.5,
        borderRadius: 2,
        ...(rowSurfaceSx(paint, cancelled) as object),
      }}
    >
      {/* Full-strength colour marker (default = themed purple; tentative = amber). */}
      <Box
        sx={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          mr: 1,
          flexShrink: 0,
          bgcolor:
            paint.kind === 'custom'
              ? paint.bg
              : paint.kind === 'tentative'
                ? 'warning.main'
                : 'primary.main',
        }}
      />
      <ListItemText
        primary={formatBookingTitle(booking, t)}
        secondary={formatDateRange(booking.start_date, booking.end_date, locale)}
        primaryTypographyProps={{
          sx: { textDecoration: cancelled ? 'line-through' : 'none' },
        }}
      />
      {cancelled ? (
        <Chip size="small" label={t('booking.status.cancelled')} />
      ) : marker ? null : due > 0 ? (
        <Chip
          size="small"
          color="error"
          variant="outlined"
          label={`${t('booking.card.due_label')}: ${maskAmount(formatRupees(due), showAmounts)}`}
        />
      ) : (
        <Chip size="small" color="success" variant="outlined" label={t('invoice.fully_paid')} />
      )}
    </ListItemButton>
  );
}
