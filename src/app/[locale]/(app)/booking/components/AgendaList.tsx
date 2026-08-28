'use client';

// Agenda list of the visible month's bookings, below the grid (§4.1).
// Cancelled bookings stay visible here with strikethrough.

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { useLocale, useTranslations } from 'next-intl';
import { computeDue } from '@/lib/booking/due';
import { effectiveBookingColor } from '@/lib/booking/bookingColors';
import type { EventTypePreset } from '@/lib/booking/eventTypePresets';
import { formatDateRange } from '@/lib/booking/dates';
import { formatRupees } from '@/lib/booking/money';
import type { Booking, BookingPayment } from '@/lib/booking/types';
import { formatBookingTitle } from './format';

export default function AgendaList({
  bookings,
  paymentsByBooking,
  presets,
  onOpen,
}: {
  bookings: Booking[];
  paymentsByBooking: Record<string, BookingPayment[]>;
  /** Live event-type presets for type-default color resolution (null = static fallback). */
  presets?: EventTypePreset[] | null;
  onOpen: (booking: Booking) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const sorted = [...bookings].sort((a, b) => a.start_date.localeCompare(b.start_date));

  return (
    <>
      <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>
        {t('booking.calendar.agenda_title')}
      </Typography>
      {sorted.length === 0 ? (
        <Typography color="text.secondary">{t('booking.calendar.agenda_empty')}</Typography>
      ) : (
        <List disablePadding>
          {sorted.map((booking) => {
            const cancelled = booking.status === 'cancelled';
            const due = computeDue(booking.total_amount, paymentsByBooking[booking.id] ?? []);
            const colorDef = effectiveBookingColor(booking, presets);
            return (
              <ListItemButton
                key={booking.id}
                onClick={() => onOpen(booking)}
                divider
                sx={{ px: 1 }}
              >
                {/* Booking color marker (default = themed purple). */}
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    mr: 1,
                    flexShrink: 0,
                    bgcolor: colorDef?.hex ?? 'primary.main',
                    opacity: cancelled ? 0.4 : 1,
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
                ) : due > 0 ? (
                  <Chip
                    size="small"
                    color="error"
                    variant="outlined"
                    label={`${t('booking.card.due_label')}: ${formatRupees(due)}`}
                  />
                ) : (
                  <Chip
                    size="small"
                    color="success"
                    variant="outlined"
                    label={t('invoice.fully_paid')}
                  />
                )}
              </ListItemButton>
            );
          })}
        </List>
      )}
    </>
  );
}
