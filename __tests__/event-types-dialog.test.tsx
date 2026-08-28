/**
 * EventTypeDialog (Menu → Settings → Event types): duplicate-name validation
 * against the live presets, self-exclusion in edit mode, emoji + 16-swatch
 * colour picker, and the save payload shape.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '../messages/en.json';
import { EventTypeDialog } from '@/app/[locale]/(app)/menu/_components/EventTypesScreen';
import type { EventTypeInput, EventTypePreset } from '@/lib/booking/eventTypePresets';

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
  makePreset({ id: 'p1', label: 'Wedding', icon: '\u{1F492}', color: 'tomato' }),
  makePreset({ id: 'p2', label: 'Birthday', icon: '\u{1F382}', color: 'banana' }),
];

function renderDialog({
  mode = 'add' as 'add' | 'edit',
  preset = null as EventTypePreset | null,
  onSave = jest.fn(),
} = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <EventTypeDialog mode={mode} preset={preset} presets={presets} onSave={onSave} onClose={() => {}} />
    </NextIntlClientProvider>,
  );
  return { onSave };
}

const nameField = () => screen.getByLabelText(new RegExp(en.settings.event_types.name_label));
const saveButton = () => screen.getByRole('button', { name: en.common.action.save });

describe('EventTypeDialog', () => {
  it('flags a duplicate name (case-insensitive) and disables Save', () => {
    renderDialog();
    fireEvent.change(nameField(), { target: { value: 'wedding' } });
    expect(screen.getByText(en.settings.event_types.duplicate_name)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it('an empty name disables Save without a duplicate error', () => {
    renderDialog();
    expect(saveButton()).toBeDisabled();
    expect(screen.queryByText(en.settings.event_types.duplicate_name)).not.toBeInTheDocument();
  });

  it('edit mode excludes the preset itself but still flags other labels', () => {
    const preset = presets[0] as EventTypePreset;
    renderDialog({ mode: 'edit', preset });
    // Own name is fine…
    expect(screen.queryByText(en.settings.event_types.duplicate_name)).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
    // …another live preset's name is not.
    fireEvent.change(nameField(), { target: { value: 'Birthday' } });
    expect(screen.getByText(en.settings.event_types.duplicate_name)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it('saves the trimmed label, emoji and picked swatch colour', () => {
    const onSave = jest.fn();
    renderDialog({ onSave });
    fireEvent.change(nameField(), { target: { value: '  Mehndi  ' } });
    fireEvent.change(screen.getByLabelText(new RegExp(en.settings.event_types.icon_label)), {
      target: { value: '\u{1F33F}' },
    });
    fireEvent.click(screen.getByRole('button', { name: en.booking.color.fuchsia }));
    fireEvent.click(saveButton());
    expect(onSave).toHaveBeenCalledWith({
      label: 'Mehndi',
      icon: '\u{1F33F}',
      color: 'fuchsia',
    } satisfies EventTypeInput);
  });

  it('the default swatch saves colour null (themed default)', () => {
    const onSave = jest.fn();
    renderDialog({ onSave });
    fireEvent.change(nameField(), { target: { value: 'Farewell' } });
    fireEvent.click(screen.getByRole('button', { name: en.booking.color.default }));
    fireEvent.click(saveButton());
    expect(onSave).toHaveBeenCalledWith({ label: 'Farewell', icon: '\u2728', color: null });
  });
});
