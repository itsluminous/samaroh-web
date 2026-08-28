/**
 * BookingForm × live event-type presets: the dropdown lists the business's
 * presets (plus the free-text custom option), saving SNAPSHOTS the preset's
 * label/icon into the payload, and editing re-selects the matching preset —
 * or falls back to free text when the preset was renamed away.
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
    sort_order: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

const presets = [
  makePreset({ id: 'p1', label: 'Shaadi', icon: '\u{1F492}', color: 'tomato', sort_order: 0 }),
  makePreset({ id: 'p2', label: 'Mehndi Night', icon: '\u{1F33F}', color: 'fuchsia', sort_order: 1 }),
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

function openTypeDropdown() {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: en.booking.form.event_type }));
  return within(screen.getByRole('listbox'));
}

describe('BookingForm reads live presets', () => {
  it('lists the presets in order plus the free-text custom option', () => {
    renderForm();
    const listbox = openTypeDropdown();
    const options = listbox.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual([
      '\u{1F492} Shaadi',
      '\u{1F33F} Mehndi Night',
      `\u2728 ${en.booking.event_type.custom}`,
    ]);
  });

  it('saving with a preset selected snapshots its label + icon into the payload', async () => {
    const onSave = jest.fn(async () => {});
    renderForm({ onSave });
    fireEvent.click(openTypeDropdown().getByRole('option', { name: '\u{1F33F} Mehndi Night' }));
    fireEvent.change(screen.getByLabelText(new RegExp(en.booking.form.customer_name)), {
      target: { value: 'Asha Verma' },
    });
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [input] = onSave.mock.calls[0] as unknown as [BookingInput];
    expect(input.event_type).toBe('Mehndi Night');
    expect(input.event_icon).toBe('\u{1F33F}');
  });

  it('custom free-text stays: typed label and emoji land in the payload', async () => {
    const onSave = jest.fn(async () => {});
    renderForm({ onSave });
    fireEvent.click(
      openTypeDropdown().getByRole('option', { name: `\u2728 ${en.booking.event_type.custom}` }),
    );
    fireEvent.change(screen.getByLabelText(new RegExp(en.booking.form.custom_label)), {
      target: { value: 'Sangeet' },
    });
    fireEvent.change(screen.getByLabelText(new RegExp(en.booking.form.custom_emoji)), {
      target: { value: '\u{1F3B6}' },
    });
    fireEvent.change(screen.getByLabelText(new RegExp(en.booking.form.customer_name)), {
      target: { value: 'Asha Verma' },
    });
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [input] = onSave.mock.calls[0] as unknown as [BookingInput];
    expect(input.event_type).toBe('Sangeet');
    expect(input.event_icon).toBe('\u{1F3B6}');
  });

  it('editing re-selects the preset matching the stored label snapshot', () => {
    renderForm({ initial: makeBooking({ event_type: 'Shaadi', event_icon: '\u{1F492}' }) });
    expect(
      screen.getByRole('combobox', { name: en.booking.form.event_type }),
    ).toHaveTextContent('Shaadi');
  });

  it('editing a booking whose preset was renamed falls back to free text with the snapshot intact', () => {
    renderForm({ initial: makeBooking({ event_type: 'Old Label', event_icon: '\u{1F389}' }) });
    expect(screen.getByLabelText(new RegExp(en.booking.form.custom_label))).toHaveValue('Old Label');
    expect(screen.getByLabelText(new RegExp(en.booking.form.custom_emoji))).toHaveValue('\u{1F389}');
  });
});
