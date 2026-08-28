'use client';

// Agenda list of the visible month's bookings, below the grid (§4.1).
// Cancelled bookings stay visible here with strikethrough.

import List from '@mui/material/List';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import type { EventTypePreset } from '@/lib/booking/eventTypePresets';
import type { Booking, BookingPayment } from '@/lib/booking/types';
import BookingRow from './BookingRow';

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
          {sorted.map((booking) => (
            <BookingRow
              key={booking.id}
              booking={booking}
              payments={paymentsByBooking[booking.id] ?? []}
              presets={presets}
              onClick={() => onOpen(booking)}
            />
          ))}
        </List>
      )}
    </>
  );
}
