// RTL rendering tests for the calendar grid + summary card (localized,
// status-styled pills; cancelled hidden; agenda shows cancelled struck through).

import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import en from '../messages/en.json';
import theme from '@/theme/theme';
import AgendaList from '@/app/[locale]/(app)/booking/components/AgendaList';
import CalendarGrid from '@/app/[locale]/(app)/booking/components/CalendarGrid';
import SummaryCard from '@/app/[locale]/(app)/booking/components/SummaryCard';
import { makeBooking } from '../test-utils/fixtures';

function wrap(children: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      {children}
    </NextIntlClientProvider>,
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
