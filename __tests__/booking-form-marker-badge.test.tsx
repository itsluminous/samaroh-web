/**
 * BookingForm event-type picker × marker badge (parity with Android): every
 * marker-kind option renders the flag "Marker" badge, booking-kind options
 * and the free-text custom option do not; the closed field carries the badge
 * too while a marker is selected (Android parity: it is the field prefix
 * there); the `booking.event_type.marker_hint` helper text
 * appears under the field only while a marker type is selected — in both
 * locales, with zero hardcoded copy.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '../messages/en.json';
import hi from '../messages/hi.json';
import BookingForm from '@/app/[locale]/(app)/booking/components/BookingForm';
import type { EventTypePreset } from '@/lib/booking/eventTypePresets';
import { makeBooking } from '../test-utils/fixtures';

type Messages = typeof en;

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
  makePreset({ id: 'p1', label: 'Wedding', icon: '\u{1F492}', kind: 'booking', sort_order: 0 }),
  makePreset({ id: 'p2', label: 'Lagan', icon: '\u2B50', kind: 'marker', sort_order: 1 }),
  makePreset({ id: 'p3', label: 'Tilak', icon: '\u{1FA94}', kind: 'marker', sort_order: 2 }),
  makePreset({ id: 'p4', label: 'Birthday', icon: '\u{1F382}', kind: 'booking', sort_order: 3 }),
];

function renderForm({
  locale = 'en',
  messages = en,
  initial = null,
}: { locale?: 'en' | 'hi'; messages?: Messages; initial?: ReturnType<typeof makeBooking> | null } = {}) {
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <BookingForm
        mode={initial ? 'edit' : 'add'}
        initial={initial}
        initialDate="2026-09-10"
        payments={[]}
        presets={presets}
        isOwner
        onCheckOverlaps={async () => ({ conflictCount: 0, blocked: false })}
        onCheckInvoiceNumber={async () => false}
        onSave={async () => {}}
        onClose={() => {}}
      />
    </NextIntlClientProvider>,
  );
}

function openPicker(messages: Messages = en) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: messages.booking.form.event_type }));
  return within(screen.getByRole('listbox'));
}

/** Option whose text starts with "icon label" (marker options also carry the badge). */
function optionFor(listbox: ReturnType<typeof within>, prefix: string) {
  return listbox.getByRole('option', { name: (n: string) => n === prefix || n.startsWith(`${prefix} `) });
}

const badgeIn = (el: HTMLElement) => el.querySelector('[data-marker-badge]');

describe('BookingForm event-type picker — marker badge', () => {
  it('renders the flag badge on marker-kind options only', () => {
    renderForm();
    const listbox = openPicker();
    const lagan = optionFor(listbox, '\u2B50 Lagan');
    const tilak = optionFor(listbox, '\u{1FA94} Tilak');
    const wedding = optionFor(listbox, '\u{1F492} Wedding');
    const birthday = optionFor(listbox, '\u{1F382} Birthday');
    const custom = optionFor(listbox, `\u2728 ${en.booking.event_type.custom}`);

    for (const marker of [lagan, tilak]) {
      const badge = badgeIn(marker);
      expect(badge).not.toBeNull();
      expect(badge).toHaveTextContent(en.booking.event_type.marker_badge);
      // Flag icon travels with the label.
      expect(badge!.querySelector('svg')).not.toBeNull();
      expect(marker).toHaveAccessibleName(expect.stringContaining(en.booking.event_type.marker_badge));
    }
    for (const bookable of [wedding, birthday, custom]) {
      expect(badgeIn(bookable)).toBeNull();
      expect(bookable.textContent).not.toContain(en.booking.event_type.marker_badge);
    }
    // Exactly two badges in the whole list.
    expect(listbox.getAllByRole('option').filter((o) => badgeIn(o) !== null)).toHaveLength(2);
  });

  it('shows the marker hint under the field only while a marker type is selected', () => {
    renderForm();
    const hint = () => screen.queryByText(en.booking.event_type.marker_hint);
    expect(hint()).not.toBeInTheDocument(); // default: first preset (Wedding, bookable)

    fireEvent.click(optionFor(openPicker(), '\u2B50 Lagan'));
    expect(hint()).toBeInTheDocument();
    // The closed field shows the badge + "icon label" while a marker is selected
    // (Android shows the same badge as the field prefix).
    const combobox = () =>
      screen.getByRole('combobox', { name: new RegExp(en.booking.form.event_type) });
    expect(combobox()).toHaveTextContent('\u2B50 Lagan');
    expect(badgeIn(combobox())).not.toBeNull();

    fireEvent.click(optionFor(openPicker(), '\u{1F492} Wedding'));
    expect(hint()).not.toBeInTheDocument();
    expect(badgeIn(combobox())).toBeNull(); // bookable type: no badge in the closed field

    fireEvent.click(optionFor(openPicker(), `\u2728 ${en.booking.event_type.custom}`));
    expect(hint()).not.toBeInTheDocument(); // free-text custom types are real bookings
  });

  it('edit mode: a stored marker booking opens with the hint already visible', () => {
    renderForm({ initial: makeBooking({ event_type: 'Tilak', event_icon: '\u{1FA94}' }) });
    expect(screen.getByText(en.booking.event_type.marker_hint)).toBeInTheDocument();
  });

  it('localizes the badge and hint (Hindi)', () => {
    renderForm({ locale: 'hi', messages: hi });
    const listbox = openPicker(hi);
    expect(badgeIn(optionFor(listbox, '\u2B50 Lagan'))).toHaveTextContent(hi.booking.event_type.marker_badge);
    fireEvent.click(optionFor(listbox, '\u2B50 Lagan'));
    expect(screen.getByText(hi.booking.event_type.marker_hint)).toBeInTheDocument();
    // Sanity: the Hindi copy really differs from English (no en fallback).
    expect(hi.booking.event_type.marker_badge).not.toBe(en.booking.event_type.marker_badge);
    expect(hi.booking.event_type.marker_hint).not.toBe(en.booking.event_type.marker_hint);
  });
});
