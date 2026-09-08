/**
 * Marker-kind bookings show NO status chip/text in the row surfaces —
 * the day chooser dialog, the month agenda and the events view (parity
 * rule: status is meaningless for a Lagan/Tilak day marker). The only
 * chip a marker row may carry is Cancelled, and cancelled rows keep
 * their strikethrough. Booking-kind rows are unaffected (due/paid chips).
 */
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import en from '../messages/en.json';
import theme from '@/theme/theme';
import AgendaList from '@/app/[locale]/(app)/booking/components/AgendaList';
import DayBookingsDialog from '@/app/[locale]/(app)/booking/components/DayBookingsDialog';
import EventsAgenda from '@/app/[locale]/(app)/booking/components/EventsAgenda';
import type { AgendaWindowState } from '@/app/[locale]/(app)/booking/components/useAgendaWindow';
import type { EventTypePreset } from '@/lib/booking/eventTypePresets';
import type { Booking } from '@/lib/booking/types';
import { makeBooking } from '../test-utils/fixtures';

function makePreset(overrides: Partial<EventTypePreset>): EventTypePreset {
  return {
    id: 'p-x',
    business_id: 'biz-1',
    label: 'X',
    icon: '\u2728',
    color: null,
    kind: 'booking',
    sort_order: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

const presets = [
  makePreset({ id: 'p1', label: 'Wedding', kind: 'booking' }),
  makePreset({ id: 'p2', label: 'Lagan', kind: 'marker' }),
];

const marker = () =>
  makeBooking({
    event_type: 'Lagan',
    total_amount: 0,
    customer_name: 'Marker Day',
    start_date: '2026-07-10',
    end_date: '2026-07-10',
  });
const realBooking = () =>
  makeBooking({
    event_type: 'Wedding',
    total_amount: 50000,
    customer_name: 'Ramesh Kumar',
    start_date: '2026-07-10',
    end_date: '2026-07-10',
  });

function wrap(children: ReactNode) {
  return render(
    <ThemeProvider theme={theme}>
      <NextIntlClientProvider locale="en" messages={en}>
        {children}
      </NextIntlClientProvider>
    </ThemeProvider>,
  );
}

/** No status text and no payment chip anywhere in the rendered surface. */
function expectNoMarkerStatus() {
  expect(screen.queryByText(en.booking.status.confirmed)).not.toBeInTheDocument();
  expect(screen.queryByText(en.booking.status.tentative)).not.toBeInTheDocument();
  expect(screen.queryByText(new RegExp(`${en.booking.card.due_label}:`))).not.toBeInTheDocument();
  expect(screen.queryByText(en.invoice.fully_paid)).not.toBeInTheDocument();
}

describe('DayBookingsDialog — marker rows carry no status chip/text', () => {
  it('a confirmed marker shows neither Confirmed nor a payment chip', () => {
    wrap(
      <DayBookingsDialog
        iso="2026-07-10"
        bookings={[marker()]}
        paymentsByBooking={{}}
        presets={presets}
        canCreate
        onOpenBooking={() => {}}
        onAddNew={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/Marker Day/)).toBeInTheDocument();
    expectNoMarkerStatus();
  });

  it('a booking-kind row in the same dialog keeps its due chip', () => {
    wrap(
      <DayBookingsDialog
        iso="2026-07-10"
        bookings={[marker(), realBooking()]}
        paymentsByBooking={{}}
        presets={presets}
        canCreate
        onOpenBooking={() => {}}
        onAddNew={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(`${en.booking.card.due_label}: \u20B950,000`)).toBeInTheDocument();
    expect(screen.queryByText(en.booking.status.confirmed)).not.toBeInTheDocument();
  });
});

describe('AgendaList (month agenda) — marker rows carry no status chip/text', () => {
  it('a confirmed marker shows neither Confirmed nor a payment chip', () => {
    wrap(
      <AgendaList
        bookings={[marker(), realBooking()]}
        paymentsByBooking={{}}
        presets={presets}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText(/Marker Day/)).toBeInTheDocument();
    expect(screen.queryByText(en.booking.status.confirmed)).not.toBeInTheDocument();
    expect(screen.queryByText(en.invoice.fully_paid)).not.toBeInTheDocument();
    // The booking-kind row keeps its due chip.
    expect(screen.getByText(`${en.booking.card.due_label}: \u20B950,000`)).toBeInTheDocument();
  });

  it('a cancelled marker keeps the Cancelled chip and strikethrough', () => {
    wrap(
      <AgendaList
        bookings={[makeBooking({ event_type: 'Lagan', status: 'cancelled', customer_name: 'Gone Marker' })]}
        paymentsByBooking={{}}
        presets={presets}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText(en.booking.status.cancelled)).toBeInTheDocument();
    expect(screen.getByText(/Gone Marker/)).toHaveStyle({ textDecoration: 'line-through' });
    expect(screen.queryByText(en.booking.status.confirmed)).not.toBeInTheDocument();
  });
});

describe('EventsAgenda (events view) — marker rows carry no status chip/text', () => {
  function agendaState(bookings: Booking[]): AgendaWindowState {
    return {
      window: {
        bookings,
        past: { date: '2026-07-10', inclusive: false, exhausted: true },
        future: { date: '2026-07-10', inclusive: true, exhausted: true },
      },
      paymentsByBooking: {},
      today: '2026-07-10',
      loading: false,
      loadingPast: false,
      loadingFuture: false,
      error: false,
      loadMore: jest.fn(),
      refresh: jest.fn(),
      retry: jest.fn(),
    };
  }

  it('a confirmed marker shows neither Confirmed nor a payment chip; booking rows keep theirs', () => {
    wrap(
      <EventsAgenda
        agenda={agendaState([marker(), realBooking()])}
        presets={presets}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText(/Marker Day/)).toBeInTheDocument();
    expect(screen.queryByText(en.booking.status.confirmed)).not.toBeInTheDocument();
    expect(screen.queryByText(en.invoice.fully_paid)).not.toBeInTheDocument();
    expect(screen.getByText(`${en.booking.card.due_label}: \u20B950,000`)).toBeInTheDocument();
  });

  it('a cancelled marker keeps the Cancelled chip and strikethrough', () => {
    wrap(
      <EventsAgenda
        agenda={agendaState([
          makeBooking({ event_type: 'Lagan', status: 'cancelled', customer_name: 'Gone Marker', start_date: '2026-07-10', end_date: '2026-07-10' }),
        ])}
        presets={presets}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText(en.booking.status.cancelled)).toBeInTheDocument();
    expect(screen.getByText(/Gone Marker/)).toHaveStyle({ textDecoration: 'line-through' });
    expect(screen.queryByText(en.booking.status.confirmed)).not.toBeInTheDocument();
  });
});
