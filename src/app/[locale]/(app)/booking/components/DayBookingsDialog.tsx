'use client';

// Day chooser (§4.1): tapping a date with bookings — even just one — lists
// that day's bookings plus a final "Add new event" row that opens the add
// form prefilled with the date. (Empty dates skip this and open the form
// directly; see BookingScreen.handleDayClick.)

import AddIcon from '@mui/icons-material/Add';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import { useLocale, useTranslations } from 'next-intl';
import { formatDate } from '@/lib/booking/dates';
import type { EventTypePreset } from '@/lib/booking/eventTypePresets';
import type { Booking, BookingPayment } from '@/lib/booking/types';
import BookingRow from './BookingRow';

export default function DayBookingsDialog({
  iso,
  bookings,
  paymentsByBooking,
  presets,
  showAmounts,
  canCreate,
  onOpenBooking,
  onAddNew,
  onClose,
}: {
  /** The tapped date (yyyy-mm-dd). */
  iso: string;
  /** Non-cancelled bookings covering the date. */
  bookings: Booking[];
  paymentsByBooking: Record<string, BookingPayment[]>;
  presets?: EventTypePreset[] | null;
  /** false = booking.view_amounts denied — due chips render ₹•••. */
  showAmounts?: boolean;
  /** Gates the final "Add new event" row. */
  canCreate: boolean;
  onOpenBooking: (booking: Booking) => void;
  onAddNew: () => void;
  onClose: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{formatDate(iso, locale)}</DialogTitle>
      <DialogContent sx={{ px: 2 }}>
        <List disablePadding>
          {bookings.map((booking) => (
            <BookingRow
              key={booking.id}
              booking={booking}
              payments={paymentsByBooking[booking.id] ?? []}
              presets={presets}
              showAmounts={showAmounts}
              onClick={() => onOpenBooking(booking)}
            />
          ))}
          {canCreate ? (
            <ListItemButton onClick={onAddNew} sx={{ px: 1, borderRadius: 2 }}>
              <ListItemIcon sx={{ minWidth: 36 }}>
                <AddIcon color="primary" />
              </ListItemIcon>
              <ListItemText
                primary={t('booking.calendar.add_new_event')}
                primaryTypographyProps={{ sx: { color: 'primary.main', fontWeight: 600 } }}
              />
            </ListItemButton>
          ) : null}
        </List>
      </DialogContent>
    </Dialog>
  );
}
