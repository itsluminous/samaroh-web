/**
 * Guest-mode local store: one Dexie (IndexedDB) table per Postgres table the
 * app reads/writes, all keyed by the client-generated `id` uuid — except
 * note_tag_links, whose natural key is the composite (note_id, tag_id),
 * mirroring the server PK (migration 005). This is the ONLY storage in guest
 * mode — nothing is sent to Supabase.
 */
import Dexie, { type EntityTable } from 'dexie';

export type LocalRow = Record<string, unknown> & { id: string };

/** Tables the app queries (001_schema + 005_notes + 006_event_types). */
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
  'notes',
  'note_tags',
  'note_tag_links',
] as const;

export type LocalTableName = (typeof LOCAL_TABLES)[number];

/**
 * Tables whose primary key is a composite of columns instead of `id` —
 * mirrors the server schema (note_tag_links PK (note_id, tag_id)). The local
 * client uses this to detect duplicates and address rows.
 */
export const COMPOSITE_PK: Partial<Record<LocalTableName, readonly string[]>> = {
  note_tag_links: ['note_id', 'tag_id'],
};

const V2_TABLES = LOCAL_TABLES.filter(
  (t) => t !== 'notes' && t !== 'note_tags' && t !== 'note_tag_links',
);

function storeSpec(name: LocalTableName): string {
  const composite = COMPOSITE_PK[name];
  return composite ? `[${composite.join('+')}]` : 'id';
}

type Stores = { [K in LocalTableName]: EntityTable<LocalRow, 'id'> };

const db = new Dexie('samaroh-guest-data') as Dexie & Stores;

// v1 shipped without event_types; v2 (migration 006 parity) added it; v3
// (migration 005 NOTES parity) adds notes / note_tags / note_tag_links. Keep
// the older declarations so existing guest databases upgrade in place.
db.version(1).stores(
  Object.fromEntries(V2_TABLES.filter((t) => t !== 'event_types').map((t) => [t, 'id'])),
);
db.version(2).stores(Object.fromEntries(V2_TABLES.map((t) => [t, 'id'])));
db.version(3).stores(Object.fromEntries(LOCAL_TABLES.map((t) => [t, storeSpec(t)])));

export const guestDb = db;

export function localTable(name: string): EntityTable<LocalRow, 'id'> | null {
  return (LOCAL_TABLES as readonly string[]).includes(name)
    ? db[name as LocalTableName]
    : null;
}
