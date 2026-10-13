/**
 * "Record expense against an event" — pure helpers shared by the booking
 * detail entry point, the party-ledger "Show event" control and the card's
 * Expenses history (shared/docs/expense-against-event.md revision 2;
 * migrations 012 `expenses.booking_id` + 014 `parties.booking_id`).
 */
import type { Booking } from '@/lib/booking/types';
import { findEventType } from '@/lib/booking/eventTypes';
import type { ExpenseDirection } from '@/lib/expenses/ledger';
// The BASE catalog (41 frozen keys incl. booking.event_type.*) — NOT the
// generated messages: the event party name is stored data shared by every
// device, so legacy built-in keys resolve to the ENGLISH label regardless of
// the UI locale (contract §2.1).
import englishCatalog from '../../../shared/strings/catalog.en.json';

/** The party fields the resolution needs (a live `parties` row). */
export interface PartyCandidate {
  id: string;
  name: string;
  created_at: string;
  /** Per-party event link (migration 014); absent/undefined on pre-014 rows. */
  booking_id?: string | null;
}

/** The booking fields the event party name is built from. */
export type EventPartyBooking = Pick<Booking, 'event_type' | 'start_date' | 'customer_name'>;

/** `lower(trim(name))` — the contract's name equality. */
export function partyNameKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}

/** English three-letter month abbreviations (contract §2.1 — never the device locale). */
const ENGLISH_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/**
 * Contract §2.1 `{dd-MMM-yyyy}` from an ISO `yyyy-mm-dd` date: two-digit day,
 * English month, four-digit year. Pure string slicing — no Date/Intl, so no
 * timezone shift and no locale digits.
 */
export function eventPartyDate(isoDate: string): string {
  const year = isoDate.slice(0, 4);
  const month = Number(isoDate.slice(5, 7));
  const day = isoDate.slice(8, 10);
  return `${day}-${ENGLISH_MONTHS[month - 1] ?? isoDate.slice(5, 7)}-${year}`;
}

/**
 * Contract §2.1 `{EventTypeLabel}`: the stored `bookings.event_type` trimmed
 * (a preset label snapshot — user data, kept verbatim even when Hindi), EXCEPT
 * a legacy built-in KEY (`wedding`, `room_booking`, …), which resolves to that
 * preset's ENGLISH catalog label. Never the emoji.
 *
 * Key matching follows the contract's normalize rule (Android
 * `EventTypeKinds.normalize`: trim, lower-case, spaces → underscores) so both
 * platforms mint the SAME party name for `Room booking` / `WEDDING` — a
 * case-only difference would otherwise split the ledger across devices.
 */
export function eventPartyTypeLabel(eventType: string): string {
  const trimmed = eventType.trim();
  const def = findEventType(trimmed.toLowerCase().replace(/ /g, '_'));
  if (def) {
    const entry = (englishCatalog as Record<string, { value: string } | undefined>)[def.label_key];
    if (entry?.value) {
      return entry.value;
    }
  }
  return trimmed;
}

/** Contract §2.1 `{CustomerName}`: trimmed, internal whitespace runs collapsed. */
export function eventPartyCustomerName(customerName: string): string {
  return customerName.trim().replace(/\s+/g, ' ');
}

/** Contract §2.1 separator: space, hyphen-minus (U+002D), space. */
export const EVENT_PARTY_SEPARATOR = ' - ';

/**
 * Contract §2.1 — the EVENT PARTY name, deterministic and English on every
 * device: `{EventTypeLabel} - {dd-MMM-yyyy} - {CustomerName}`, e.g.
 * `Wedding - 20-Oct-2026 - Sandhya Upadhyay`.
 */
export function eventPartyName(booking: EventPartyBooking): string {
  return [
    eventPartyTypeLabel(booking.event_type),
    eventPartyDate(booking.start_date),
    eventPartyCustomerName(booking.customer_name),
  ].join(EVENT_PARTY_SEPARATOR);
}

/** Earliest `created_at` wins among several candidates (offline races, legacy twins). */
function earliest<T extends PartyCandidate>(candidates: readonly T[]): T | null {
  let best: T | null = null;
  for (const party of candidates) {
    if (best === null || party.created_at < best.created_at) {
      best = party;
    }
  }
  return best;
}

/**
 * Contract §2.2 step 1 — BY LINK: the live party whose `booking_id` is this
 * booking, whatever its current name (renames follow the booking). Callers
 * pass live rows only.
 */
export function matchLinkedParty<T extends PartyCandidate>(parties: readonly T[], bookingId: string): T | null {
  return earliest(parties.filter((party) => party.booking_id === bookingId));
}

/**
 * Contract §2.2 step 2 — BY NAME: the live party whose `lower(trim(name))`
 * equals the given name. Tombstones never match (callers pass live rows
 * only — migration 008 lets a deleted name be re-created).
 */
export function matchLiveParty<T extends PartyCandidate>(parties: readonly T[], name: string): T | null {
  const key = partyNameKey(name);
  return earliest(parties.filter((party) => partyNameKey(party.name) === key));
}

/**
 * Contract §2.2 step 3 — the party row created when neither link nor name
 * matches: the §2.1 name, the booking's phone (null when blank),
 * `business_related = true` (event spend IS business spend) and the link.
 */
export function newPartyFromBooking(
  booking: Pick<Booking, 'id' | 'event_type' | 'start_date' | 'customer_name' | 'customer_phone'>,
): {
  name: string;
  phone: string | null;
  businessRelated: true;
  bookingId: string;
} {
  const phone = booking.customer_phone?.trim() ?? '';
  return {
    name: eventPartyName(booking),
    phone: phone === '' ? null : phone,
    businessRelated: true,
    bookingId: booking.id,
  };
}

/** Separator of the default notes (middot, as the booking card's dates line). */
export const EVENT_SEPARATOR = ' \u00B7 ';

/** The expense fields the booking card's Expenses history (§3b) renders. */
export interface BookingExpenseRow {
  id: string;
  direction: ExpenseDirection;
  amount: number;
  expense_date: string;
  notes: string | null;
  created_at: string;
}

/** Contract §3b order: newest first — `expense_date desc`, then `created_at desc`. */
export function sortExpensesNewestFirst<T extends BookingExpenseRow>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.expense_date !== b.expense_date) {
      return a.expense_date < b.expense_date ? 1 : -1;
    }
    return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0;
  });
}

/** Contract §3b footer: Σ paid − Σ received over the listed rows (informational — never touches Due). */
export function expensesHistoryTotal(rows: readonly BookingExpenseRow[]): number {
  return rows.reduce(
    (sum, row) => sum + (row.direction === 'paid' ? Number(row.amount) : -Number(row.amount)),
    0,
  );
}

/**
 * Error raised by the save path when the booking has no event party yet and
 * the member lacks `expenses.manage_parties` (RLS `parties_insert`). The UI
 * maps it to `expenses.entry.party_create_forbidden` ({name} = the event
 * party name); nothing is written.
 */
export class PartyCreateForbiddenError extends Error {
  readonly partyName: string;

  constructor(partyName: string) {
    super('party_create_forbidden');
    this.name = 'PartyCreateForbiddenError';
    this.partyName = partyName;
  }
}
