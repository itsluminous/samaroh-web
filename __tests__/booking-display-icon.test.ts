/**
 * Tentative display icon (ADR-020 #3 parity): tentative bookings render 👤
 * in every calendar/list/title surface regardless of event type; any other
 * status keeps the stored event icon. Presentation-only — the stored
 * event_icon is never rewritten, so confirming reverts automatically.
 */
import { displayIcon, TENTATIVE_ICON } from '@/lib/booking/displayIcon';
import { formatBookingTitle, pillLabel } from '@/app/[locale]/(app)/booking/components/format';
import type { Booking } from '@/lib/booking/types';

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

const t = (key: string) => key;

describe('displayIcon (ADR-020 #3)', () => {
  it('is 👤 for tentative bookings regardless of event type', () => {
    expect(displayIcon(makeBooking({ status: 'tentative' }))).toBe(TENTATIVE_ICON);
    expect(
      displayIcon(makeBooking({ status: 'tentative', event_icon: '\u{1FA94}' })),
    ).toBe(TENTATIVE_ICON);
  });

  it('is the stored event icon for every other status', () => {
    for (const status of ['confirmed', 'completed', 'cancelled'] as const) {
      expect(displayIcon(makeBooking({ status }))).toBe('\u{1F492}');
    }
  });

  it('drives the card title and the calendar pill label', () => {
    const tentative = makeBooking({ status: 'tentative' });
    expect(formatBookingTitle(tentative, t)).toBe(`${TENTATIVE_ICON} Wedding - Asha Verma`);
    expect(pillLabel(tentative)).toBe(`${TENTATIVE_ICON} Asha`);

    const confirmed = makeBooking();
    expect(formatBookingTitle(confirmed, t)).toBe('\u{1F492} Wedding - Asha Verma');
    expect(pillLabel(confirmed)).toBe('\u{1F492} Asha');
  });
});
