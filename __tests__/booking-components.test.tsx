// RTL rendering tests for the calendar grid + summary card (localized,
// status-styled pills; cancelled hidden; agenda shows cancelled struck through),
// plus the shared BookingRow (colour-tinted rows) and the day chooser dialog.

import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import en from '../messages/en.json';
import theme from '@/theme/theme';
import AgendaList from '@/app/[locale]/(app)/booking/components/AgendaList';
import BookingRow from '@/app/[locale]/(app)/booking/components/BookingRow';
import CalendarGrid from '@/app/[locale]/(app)/booking/components/CalendarGrid';
import DayBookingsDialog from '@/app/[locale]/(app)/booking/components/DayBookingsDialog';
import SummaryCard from '@/app/[locale]/(app)/booking/components/SummaryCard';
import type { EventTypePreset } from '@/lib/booking/eventTypePresets';
import { makeBooking } from '../test-utils/fixtures';

function wrap(children: ReactNode) {
  return render(
    <ThemeProvider theme={theme}>
      <NextIntlClientProvider locale="en" messages={en}>
        {children}
      </NextIntlClientProvider>
    </ThemeProvider>,
  );
}

describe('SummaryCard', () => {
  it('shows localized received/pending amounts with Indian grouping', () => {
    wrap(<SummaryCard received={106511} pending={50000} />);
    expect(screen.getByText(en.booking.summary.this_month)).toBeInTheDocument();
    expect(screen.getByText('Received \u20B91,06,511')).toBeInTheDocument();
    expect(screen.getByText('Pending \u20B950,000')).toBeInTheDocument();
  });

  it('colors received green (success) and pending red (error)', () => {
    render(
      <ThemeProvider theme={theme}>
        <NextIntlClientProvider locale="en" messages={en}>
          <SummaryCard received={106511} pending={50000} />
        </NextIntlClientProvider>
      </ThemeProvider>,
    );
    expect(screen.getByText('Received \u20B91,06,511')).toHaveStyle({
      color: 'var(--mui-palette-success-main)',
    });
    expect(screen.getByText('Pending \u20B950,000')).toHaveStyle({
      color: 'var(--mui-palette-error-main)',
    });
  });
});

describe('CalendarGrid', () => {
  it('renders pills with icon + first name and hides cancelled bookings', () => {
    const confirmed = makeBooking({ customer_name: 'Ramesh Kumar', start_date: '2026-07-10', end_date: '2026-07-10' });
    const cancelled = makeBooking({ customer_name: 'Gone Person', status: 'cancelled', start_date: '2026-07-15', end_date: '2026-07-15' });
    wrap(
      <CalendarGrid
        year={2026}
        month0={6}
        bookings={[confirmed, cancelled]}
        blocks={[]}
        onDayClick={() => {}}
        onBookingClick={() => {}}
      />,
    );
    expect(screen.getByText('\u{1F492} Ramesh')).toBeInTheDocument();
    expect(screen.queryByText(/Gone/)).not.toBeInTheDocument();
  });
});

describe('AgendaList', () => {
  it('shows the empty state when the month has no bookings', () => {
    wrap(<AgendaList bookings={[]} paymentsByBooking={{}} onOpen={() => {}} />);
    expect(screen.getByText(en.booking.calendar.agenda_empty)).toBeInTheDocument();
  });

  it('strikes through cancelled bookings and shows the due chip on unpaid ones', () => {
    const unpaid = makeBooking({ customer_name: 'Ramesh Kumar', total_amount: 50000 });
    const cancelled = makeBooking({ customer_name: 'Gone Person', status: 'cancelled' });
    wrap(
      <AgendaList
        bookings={[unpaid, cancelled]}
        paymentsByBooking={{}}
        onOpen={() => {}}
      />,
    );
    const struck = screen.getByText(/Gone Person/);
    expect(struck).toHaveStyle({ textDecoration: 'line-through' });
    expect(screen.getByText(`${en.booking.card.due_label}: \u20B950,000`)).toBeInTheDocument();
    expect(screen.getByText(en.booking.status.cancelled)).toBeInTheDocument();
  });
});

describe('BookingRow colour mapping (explicit → preset default → themed; tentative; cancelled)', () => {
  const presets = [
    { id: 'p1', label: 'Wedding', icon: '\u{1F492}', color: 'tomato' },
    { id: 'p2', label: 'Lagan', icon: '\u2B50', color: 'peacock' },
  ] as EventTypePreset[];

  function rowOf(booking = makeBooking()) {
    const { container } = wrap(
      <BookingRow booking={booking} payments={[]} presets={presets} onClick={() => {}} />,
    );
    return container.querySelector('.MuiListItemButton-root') as HTMLElement;
  }

  it('an explicit bookings.color wins: row tinted with that colour', () => {
    // fuchsia = #C2185B → 16% tint.
    const row = rowOf(makeBooking({ event_type: 'Wedding', color: 'fuchsia' }));
    expect(row).toHaveStyle({ backgroundColor: 'rgba(194, 24, 91, 0.16)' });
  });

  it('no explicit colour → the event-type preset default tints the row (new Lagan preset)', () => {
    // peacock = #00838F.
    const row = rowOf(makeBooking({ event_type: 'Lagan', color: null }));
    expect(row).toHaveStyle({ backgroundColor: 'rgba(0, 131, 143, 0.16)' });
  });

  it('unknown type without a colour → themed default tint', () => {
    const row = rowOf(makeBooking({ event_type: 'Mehndi Night', color: null }));
    expect(row).toHaveStyle({
      backgroundColor: 'rgba(var(--mui-palette-primary-mainChannel) / 0.08)',
    });
  });

  it('tentative bookings stay visually distinct (amber outline) regardless of colour', () => {
    const row = rowOf(makeBooking({ event_type: 'Wedding', color: 'fuchsia', status: 'tentative' }));
    expect(row).toHaveStyle({
      backgroundColor: 'rgba(var(--mui-palette-warning-mainChannel) / 0.08)',
      borderColor: 'var(--mui-palette-warning-main)',
    });
  });

  it('cancelled bookings are struck through and dimmed', () => {
    const row = rowOf(makeBooking({ customer_name: 'Gone Person', status: 'cancelled' }));
    expect(row).toHaveStyle({ opacity: '0.65' });
    expect(screen.getByText(/Gone Person/)).toHaveStyle({ textDecoration: 'line-through' });
    expect(screen.getByText(en.booking.status.cancelled)).toBeInTheDocument();
  });
});

describe('DayBookingsDialog (day chooser)', () => {
  const bookings = [
    makeBooking({ customer_name: 'Ramesh Kumar', start_date: '2026-07-10', end_date: '2026-07-10' }),
    makeBooking({ customer_name: 'Sita Devi', start_date: '2026-07-10', end_date: '2026-07-10' }),
  ];

  it("lists the day's bookings plus a final Add-new-event row for creators", () => {
    const onOpen = jest.fn();
    const onAdd = jest.fn();
    wrap(
      <DayBookingsDialog
        iso="2026-07-10"
        bookings={bookings}
        paymentsByBooking={{}}
        canCreate
        onOpenBooking={onOpen}
        onAddNew={onAdd}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/Ramesh Kumar/)).toBeInTheDocument();
    expect(screen.getByText(/Sita Devi/)).toBeInTheDocument();
    const addRow = screen.getByText(en.booking.calendar.add_new_event);
    fireEvent.click(screen.getByText(/Ramesh Kumar/));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ customer_name: 'Ramesh Kumar' }));
    fireEvent.click(addRow);
    expect(onAdd).toHaveBeenCalled();
  });

  it('hides the Add-new-event row when the member cannot create', () => {
    wrap(
      <DayBookingsDialog
        iso="2026-07-10"
        bookings={[bookings[0]!]}
        paymentsByBooking={{}}
        canCreate={false}
        onOpenBooking={() => {}}
        onAddNew={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/Ramesh Kumar/)).toBeInTheDocument();
    expect(screen.queryByText(en.booking.calendar.add_new_event)).not.toBeInTheDocument();
  });
});
