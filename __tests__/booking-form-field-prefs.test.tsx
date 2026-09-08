/**
 * Booking-form field visibility prefs (ADR-020 #5 parity, device-local):
 * - Android-mirrored defaults: security deposit HIDDEN, source and times shown,
 * - localStorage overrides flip each field independently,
 * - a hidden deposit still saves the loaded value unchanged (edit mode),
 * - the Settings section toggles write the prefs back to localStorage.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '../messages/en.json';
import BookingForm from '@/app/[locale]/(app)/booking/components/BookingForm';
import {
  DEFAULT_FORM_FIELD_PREFS,
  readFormFieldPrefs,
  writeFormFieldPref,
} from '@/lib/booking/formFieldPrefs';
import type { BookingInput } from '@/lib/booking/repo';
import type { Booking } from '@/lib/booking/types';
import type { EventTypePreset } from '@/lib/booking/eventTypePresets';

const presets: EventTypePreset[] = [
  {
    id: 'et-1',
    business_id: 'biz',
    label: 'Wedding',
    icon: '\u{1F492}',
    color: 'tomato',
    kind: 'booking',
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
  },
];

function renderForm({
  initial = null,
  onSave = jest.fn(async () => {}),
}: {
  initial?: Booking | null;
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
        onCheckInvoiceNumber={async () => false}
        onSave={onSave}
        onClose={() => {}}
      />
    </NextIntlClientProvider>,
  );
  return { onSave };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('formFieldPrefs storage', () => {
  it('mirrors the Android ADR-020 #5 defaults', () => {
    expect(DEFAULT_FORM_FIELD_PREFS).toEqual({
      showSecurityDeposit: false,
      showSource: true,
      showTimes: true,
    });
    expect(readFormFieldPrefs()).toEqual(DEFAULT_FORM_FIELD_PREFS);
  });

  it('round-trips overrides through localStorage', () => {
    writeFormFieldPref('showSecurityDeposit', true);
    writeFormFieldPref('showTimes', false);
    expect(readFormFieldPrefs()).toEqual({
      showSecurityDeposit: true,
      showSource: true,
      showTimes: false,
    });
  });
});

describe('BookingForm field visibility', () => {
  it('hides the deposit field by default, keeps total/source/times', () => {
    renderForm();
    expect(screen.getByLabelText(en.booking.form.total_amount)).toBeInTheDocument();
    expect(screen.queryByLabelText(en.booking.form.security_deposit)).not.toBeInTheDocument();
    expect(screen.getByText(en.booking.form.source)).toBeInTheDocument();
    expect(screen.getByLabelText(en.booking.form.start_time)).toBeInTheDocument();
  });

  it('shows the deposit and hides source/times per stored prefs', async () => {
    writeFormFieldPref('showSecurityDeposit', true);
    writeFormFieldPref('showSource', false);
    writeFormFieldPref('showTimes', false);
    renderForm();
    await waitFor(() =>
      expect(screen.getByLabelText(en.booking.form.security_deposit)).toBeInTheDocument(),
    );
    expect(screen.queryByText(en.booking.form.source)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(en.booking.form.start_time)).not.toBeInTheDocument();
  });

  it('saves the stored deposit unchanged while the field is hidden', async () => {
    const onSave = jest.fn(async () => {});
    const booking: Booking = {
      id: 'b1',
      business_id: 'biz',
      event_type: 'Wedding',
      event_icon: '\u{1F492}',
      customer_name: 'Asha Verma',
      customer_phone: null,
      start_date: '2026-09-10',
      end_date: '2026-09-10',
      start_time: null,
      end_time: null,
      total_amount: 50000,
      security_deposit: 7000,
      source: null,
      notes: null,
      status: 'confirmed',
      color: null,
      invoice_number: null,
      created_by: 'u1',
      updated_by: null,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
      deleted_at: null,
    };
    renderForm({ initial: booking, onSave });
    expect(screen.queryByLabelText(en.booking.form.security_deposit)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const input = (onSave.mock.calls[0] as unknown as [BookingInput, number])[0];
    expect(input.security_deposit).toBe(7000);
  });
});
