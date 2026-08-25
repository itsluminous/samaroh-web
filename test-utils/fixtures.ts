// Shared fixtures for the booking/invoice unit tests.

import type { Booking, BookingPayment, DateBlock } from '@/lib/booking/types';

let seq = 0;

export function makeBooking(overrides: Partial<Booking> = {}): Booking {
  seq += 1;
  return {
    id: `booking-${seq}`,
    business_id: 'biz-1',
    event_type: 'wedding',
    event_icon: '\u{1F492}',
    customer_name: 'Ramesh Kumar',
    customer_phone: '9876543210',
    start_date: '2026-07-10',
    end_date: '2026-07-10',
    start_time: null,
    end_time: null,
    total_amount: 100000,
    security_deposit: 0,
    source: null,
    notes: null,
    status: 'confirmed',
    invoice_number: null,
    created_by: 'user-1',
    updated_by: null,
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-01T10:00:00Z',
    deleted_at: null,
    ...overrides,
  };
}

export function makePayment(overrides: Partial<BookingPayment> = {}): BookingPayment {
  seq += 1;
  return {
    id: `payment-${seq}`,
    booking_id: 'booking-1',
    business_id: 'biz-1',
    amount: 10000,
    paid_on: '2026-07-01',
    method: 'cash',
    notes: null,
    created_by: 'user-1',
    created_at: '2026-07-01T10:00:00Z',
    deleted_at: null,
    ...overrides,
  };
}

export function makeBlock(overrides: Partial<DateBlock> = {}): DateBlock {
  seq += 1;
  return {
    id: `block-${seq}`,
    business_id: 'biz-1',
    start_date: '2026-07-20',
    end_date: '2026-07-21',
    reason: null,
    created_by: 'user-1',
    deleted_at: null,
    ...overrides,
  };
}
