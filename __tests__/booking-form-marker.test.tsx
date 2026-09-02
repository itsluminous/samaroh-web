/**
 * BookingForm × marker-kind event types (parity with Android): selecting a
 * marker-kind preset hides the amount fields (total/deposit/advance) and the
 * due preview; switching back to a booking-kind preset restores them with
 * the previously typed values; and a saved marker booking forces
 * total/deposit/advance to 0 — even in edit mode with legacy amounts.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '../messages/en.json';
import BookingForm from '@/app/[locale]/(app)/booking/components/BookingForm';
import type { BookingInput } from '@/lib/booking/repo';
import type { EventTypePreset } from '@/lib/booking/eventTypePresets';
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
  makePreset({ id: 'p1', label: 'Wedding', icon: '\u{1F492}', kind: 'booking', sort_order: 0 }),
  makePreset({ id: 'p2', label: 'Lagan', icon: '\u{1FA94}', kind: 'marker', sort_order: 1 }),
];

function renderForm({
  initial = null,
  onSave = jest.fn(async () => {}),
}: {
  initial?: ReturnType<typeof makeBooking> | null;
  onSave?: (input: BookingInput, advance: number) => Promise<void>;
} = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <BookingForm
        mode={initial ? 'edit' : 'add'}
        initial={initial}
        initialDate="2026-09-10"
        payments={[]}
        presets={presets}
        isOwner
        onCheckOverlaps={async () => ({ conflictCount: 0, blocked: false })}
        onSave={onSave}
        onClose={() => {}}
      />
    </NextIntlClientProvider>,
  );
  return { onSave };
}

function pickType(name: string) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: en.booking.form.event_type }));
  fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name }));
}

const totalField = () => screen.queryByLabelText(new RegExp(en.booking.form.total_amount));
const depositField = () => screen.queryByLabelText(new RegExp(en.booking.form.security_deposit));
const advanceField = () => screen.queryByLabelText(new RegExp(en.booking.form.advance));
const duePreview = () => screen.queryByText(en.booking.form.due_auto);

describe('BookingForm — marker kind hides the amount fields', () => {
  it('selecting a marker preset hides total/deposit/advance and the due preview', () => {
    renderForm();
    expect(totalField()).toBeInTheDocument();
    pickType('\u{1FA94} Lagan');
    expect(totalField()).not.toBeInTheDocument();
    expect(depositField()).not.toBeInTheDocument();
    expect(advanceField()).not.toBeInTheDocument();
    expect(duePreview()).not.toBeInTheDocument();
  });

  it('switching back restores the fields with the previously typed values', () => {
    renderForm();
    fireEvent.change(totalField()!, { target: { value: '75000' } });
    fireEvent.change(depositField()!, { target: { value: '5000' } });
    pickType('\u{1FA94} Lagan');
    expect(totalField()).not.toBeInTheDocument();
    pickType('\u{1F492} Wedding');
    expect(totalField()).toHaveValue('75000');
    expect(depositField()).toHaveValue('5000');
    expect(duePreview()).toBeInTheDocument();
  });

  it('saving a marker booking forces total/deposit/advance to 0', async () => {
    const onSave = jest.fn(async () => {});
    renderForm({ onSave });
    // Type amounts first, THEN switch to marker — stale values must not leak.
    fireEvent.change(totalField()!, { target: { value: '75000' } });
    fireEvent.change(advanceField()!, { target: { value: '10000' } });
    pickType('\u{1FA94} Lagan');
    fireEvent.change(screen.getByLabelText(new RegExp(en.booking.form.customer_name)), {
      target: { value: 'Self' },
    });
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [input, advance] = onSave.mock.calls[0] as unknown as [BookingInput, number];
    expect(input.event_type).toBe('Lagan');
    expect(input.total_amount).toBe(0);
    expect(input.security_deposit).toBe(0);
    expect(advance).toBe(0);
  });

  it('editing a marker booking with legacy amounts hides the fields and saves 0', async () => {
    const onSave = jest.fn(async () => {});
    renderForm({
      initial: makeBooking({
        event_type: 'Lagan',
        event_icon: '\u{1FA94}',
        total_amount: 5000,
        security_deposit: 500,
      }),
      onSave,
    });
    expect(totalField()).not.toBeInTheDocument();
    expect(duePreview()).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [input, advance] = onSave.mock.calls[0] as unknown as [BookingInput, number];
    expect(input.total_amount).toBe(0);
    expect(input.security_deposit).toBe(0);
    expect(advance).toBe(0);
  });

  it('booking-kind presets keep the amount fields and payload amounts', async () => {
    const onSave = jest.fn(async () => {});
    renderForm({ onSave });
    fireEvent.change(totalField()!, { target: { value: '75000' } });
    fireEvent.change(screen.getByLabelText(new RegExp(en.booking.form.customer_name)), {
      target: { value: 'Asha' },
    });
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [input] = onSave.mock.calls[0] as unknown as [BookingInput];
    expect(input.total_amount).toBe(75000);
  });
});
