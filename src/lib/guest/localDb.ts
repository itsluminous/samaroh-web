/**
 * Guest-mode local store: one Dexie (IndexedDB) table per Postgres table the
 * app reads/writes, all keyed by the client-generated `id` uuid. This is the
 * ONLY storage in guest mode — nothing is sent to Supabase.
 */
import Dexie, { type EntityTable } from 'dexie';

export type LocalRow = Record<string, unknown> & { id: string };

/** Tables the app queries (see 001_schema.sql). */
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
] as const;

export type LocalTableName = (typeof LOCAL_TABLES)[number];

type Stores = { [K in LocalTableName]: EntityTable<LocalRow, 'id'> };

const db = new Dexie('samaroh-guest-data') as Dexie & Stores;

db.version(1).stores(Object.fromEntries(LOCAL_TABLES.map((t) => [t, 'id'])));

export const guestDb = db;

export function localTable(name: string): EntityTable<LocalRow, 'id'> | null {
  return (LOCAL_TABLES as readonly string[]).includes(name)
    ? db[name as LocalTableName]
    : null;
}
