/**
 * Manual invoice number in the booking form (ADR-020 #4 parity):
 * - optional text field with a hint while unfrozen,
 * - per-business duplicate numbers BLOCK the save with a localized error,
 * - a unique manual number is saved (trimmed; blank → null so the
 *   first-invoice allocator can assign one later),
 * - once a booking carries a number the field is read-only (frozen) and the
 *   stored value passes through the save unchanged.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '../messages/en.json';
import BookingForm from '@/app/[locale]/(app)/booking/components/BookingForm';
import type { BookingInput } from '@/lib/booking/repo';
import type { Booking } from '@/lib/booking/types';
import type { EventTypePreset } from '@/lib/booking/eventTypePresets';

const presets: EventTypePreset[] = [
  { id: 'et-1', business_id: 'biz', label: 'Wedding', icon: '\u{1F492}', color: 'tomato', kind: 'booking', sort_order: 0, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', deleted_at: null },
];

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
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
    security_deposit: 0,
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
    ...overrides,
  };
}

function renderForm({
  initial = null,
  exists = async () => false,
  onSave = jest.fn(async () => {}),
}: {
  initial?: Booking | null;
  exists?: (invoiceNumber: string, excludeId?: string) => Promise<boolean>;
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
        onCheckInvoiceNumber={exists}
        onSave={onSave}
        onClose={() => {}}
      />
    </NextIntlClientProvider>,
  );
  return { onSave };
}

function fillRequired() {
  fireEvent.change(screen.getByLabelText(/Customer name/i), {
    target: { value: 'Asha Verma' },
  });
}

describe('BookingForm manual invoice number', () => {
  it('renders the optional field with the uniqueness hint', () => {
    renderForm();
    expect(screen.getByLabelText(en.booking.form.invoice_number)).toBeInTheDocument();
    expect(screen.getByText(en.booking.form.invoice_number_hint)).toBeInTheDocument();
  });

  it('blocks the save and shows the duplicate error when the number is taken', async () => {
    const onSave = jest.fn(async () => {});
    renderForm({ exists: async () => true, onSave });
    fillRequired();
    fireEvent.change(screen.getByLabelText(en.booking.form.invoice_number), {
      target: { value: 'SGH-2026-0042' },
    });
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    await waitFor(() =>
      expect(screen.getByText(en.booking.form.invoice_number_duplicate)).toBeInTheDocument(),
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves a unique manual number (trimmed; blank stays null)', async () => {
    const onSave = jest.fn(async () => {});
    renderForm({ onSave });
    fillRequired();
    fireEvent.change(screen.getByLabelText(en.booking.form.invoice_number), {
      target: { value: '  SGH-2026-0042  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const input = (onSave.mock.calls[0] as unknown as [BookingInput, number])[0];
    expect(input.invoice_number).toBe('SGH-2026-0042');
  });

  it('defaults to null when left blank', async () => {
    const onSave = jest.fn(async () => {});
    renderForm({ onSave });
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect((onSave.mock.calls[0] as unknown as [BookingInput, number])[0].invoice_number).toBeNull();
  });

  it('freezes the field once the booking has a number and passes it through', async () => {
    const onSave = jest.fn(async () => {});
    const exists = jest.fn(async () => true); // must never be consulted when frozen
    renderForm({
      initial: makeBooking({ invoice_number: 'SGH-2026-0007' }),
      exists,
      onSave,
    });
    const field = screen.getByLabelText<HTMLInputElement>(en.booking.form.invoice_number);
    expect(field.value).toBe('SGH-2026-0007');
    expect(field).toHaveAttribute('readonly');
    // No hint while frozen.
    expect(screen.queryByText(en.booking.form.invoice_number_hint)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(exists).not.toHaveBeenCalled();
    expect((onSave.mock.calls[0] as unknown as [BookingInput, number])[0].invoice_number).toBe('SGH-2026-0007');
  });
});
