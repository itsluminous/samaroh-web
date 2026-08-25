// Domain types for the Booking section. Mirror the Supabase schema
// (shared/supabase/migrations/001_schema.sql). Money travels as decimal
// rupees (numeric(12,2) → JSON number); due is ALWAYS computed, never stored.

export type BookingStatus = 'tentative' | 'confirmed' | 'completed' | 'cancelled';
export type PaymentMethod = 'cash' | 'upi' | 'bank_transfer' | 'cheque' | 'other';
export type BookingSource = 'walk_in' | 'phone' | 'referral' | 'repeat' | 'other';

export interface Booking {
  id: string;
  business_id: string;
  event_type: string; // key from shared/event-types.json, or free text for custom
  event_icon: string; // emoji
  customer_name: string;
  customer_phone: string | null;
  start_date: string; // ISO date (yyyy-mm-dd)
  end_date: string; // ISO date, >= start_date
  start_time: string | null;
  end_time: string | null;
  total_amount: number;
  security_deposit: number;
  source: BookingSource | null;
  notes: string | null;
  status: BookingStatus;
  invoice_number: string | null; // frozen after first invoice generation
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface BookingPayment {
  id: string;
  booking_id: string;
  business_id: string;
  amount: number;
  paid_on: string; // ISO date
  method: PaymentMethod;
  notes: string | null;
  created_by: string;
  created_at: string;
  deleted_at: string | null;
}

export interface DateBlock {
  id: string;
  business_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  created_by: string;
  deleted_at: string | null;
}

export interface Business {
  id: string;
  name: string;
  business_type: string;
  address: string | null;
  owner_name: string;
  logo_path: string | null;
  invoice_prefix: string;
  invoice_counter: number;
  owner_user_id: string;
}

export interface BookingPermissions {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  record_payment: boolean;
  generate_invoice: boolean;
}

export const OWNER_PERMISSIONS: BookingPermissions = {
  view: true,
  create: true,
  edit: true,
  delete: true,
  record_payment: true,
  generate_invoice: true,
};
