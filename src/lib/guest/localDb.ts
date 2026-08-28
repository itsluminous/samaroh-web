/**
 * Guest-mode local store: one Dexie (IndexedDB) table per Postgres table the
 * app reads/writes, all keyed by the client-generated `id` uuid. This is the
 * ONLY storage in guest mode — nothing is sent to Supabase.
 */
import Dexie, { type EntityTable } from 'dexie';

export type LocalRow = Record<string, unknown> & { id: string };

/** Tables the app queries (see 001_schema.sql + 006_event_types.sql). */
export const LOCAL_TABLES = [
  'businesses',
  'business_members',
  'bookings',
  'date_blocks',
  'booking_payments',
  'parties',
  'expenses',
  'expense_attachments',
  'master_items',
  'inventory_transactions',
  'event_types',
] as const;

export type LocalTableName = (typeof LOCAL_TABLES)[number];

type Stores = { [K in LocalTableName]: EntityTable<LocalRow, 'id'> };

const db = new Dexie('samaroh-guest-data') as Dexie & Stores;

// v1 shipped without event_types; v2 (migration 006 parity) adds it. Keep the
// v1 declaration so existing guest databases upgrade in place.
db.version(1).stores(
  Object.fromEntries(LOCAL_TABLES.filter((t) => t !== 'event_types').map((t) => [t, 'id'])),
);
db.version(2).stores(Object.fromEntries(LOCAL_TABLES.map((t) => [t, 'id'])));

export const guestDb = db;

export function localTable(name: string): EntityTable<LocalRow, 'id'> | null {
  return (LOCAL_TABLES as readonly string[]).includes(name)
    ? db[name as LocalTableName]
    : null;
}
