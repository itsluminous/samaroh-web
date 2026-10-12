/**
 * "Record expense against an event" — pure helpers shared by the booking
 * detail entry point and the party-ledger event chip
 * (shared/docs/expense-against-event.md, migration 012: `expenses.booking_id`).
 */
import type { Booking } from '@/lib/booking/types';

/** The party fields the resolution needs (a live `parties` row). */
export interface PartyCandidate {
  id: string;
  name: string;
  created_at: string;
}

/** `lower(trim(name))` — the contract's name equality. */
export function partyNameKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}

/**
 * Contract §2 step 1: the LIVE party whose normalised name equals the
 * booking's customer name. Callers pass live rows only (tombstones never
 * match — migration 008 lets a deleted name be re-created). Several matches
 * (legacy mixed-case twins) → the earliest `created_at`.
 */
export function matchLiveParty<T extends PartyCandidate>(parties: readonly T[], customerName: string): T | null {
  const key = partyNameKey(customerName);
  let best: T | null = null;
  for (const party of parties) {
    if (partyNameKey(party.name) !== key) {
      continue;
    }
    if (best === null || party.created_at < best.created_at) {
      best = party;
    }
  }
  return best;
}

/**
 * Contract §2 step 2: the party row created when no live party matches —
 * trimmed customer name, phone (null when blank), `business_related =
 * false` (a customer is an event counterparty, not a supplier).
 */
export function newPartyFromBooking(booking: Pick<Booking, 'customer_name' | 'customer_phone'>): {
  name: string;
  phone: string | null;
  businessRelated: false;
} {
  const phone = booking.customer_phone?.trim() ?? '';
  return { name: booking.customer_name.trim(), phone: phone === '' ? null : phone, businessRelated: false };
}

/** Separator of the default notes and of the chip label (middot, as the booking card). */
export const EVENT_SEPARATOR = ' \u00B7 ';

/** First name per the calendar pill convention (`pillLabel`): first whitespace-separated token. */
export function customerFirstName(customerName: string): string {
  const trimmed = customerName.trim();
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

/**
 * Contract §3: chip label `{firstName} · {eventType}` — the `{label}` value
 * of `expenses.ledger.event_chip`. `eventTypeLabel` is the LOCALIZED
 * event-type label (no emoji), resolved by the caller.
 */
export function eventChipLabel(booking: Pick<Booking, 'customer_name'>, eventTypeLabel: string): string {
  return `${customerFirstName(booking.customer_name)}${EVENT_SEPARATOR}${eventTypeLabel}`;
}

/**
 * Contract §3 fallback when the linked booking cannot be resolved locally
 * (tombstoned / not pulled yet): the first segment of the entry notes IF
 * they still have the `booking_notes_default` shape (`{eventType} · {dates}`),
 * else null → the chip is omitted. Never a raw id.
 */
export function chipLabelFromNotes(notes: string | null): string | null {
  if (!notes) {
    return null;
  }
  const idx = notes.indexOf(EVENT_SEPARATOR);
  if (idx <= 0) {
    return null;
  }
  const first = notes.slice(0, idx).trim();
  return first === '' ? null : first;
}

/**
 * Error raised by the save path when the customer has no live party and the
 * member lacks `expenses.manage_parties` (RLS `parties_insert`). The UI maps
 * it to `expenses.entry.party_create_forbidden` ({name}); nothing is written.
 */
export class PartyCreateForbiddenError extends Error {
  readonly partyName: string;

  constructor(partyName: string) {
    super('party_create_forbidden');
    this.name = 'PartyCreateForbiddenError';
    this.partyName = partyName;
  }
}
