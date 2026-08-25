/**
 * Supabase data access for the inventory section (master_items,
 * inventory_transactions, inventory-images storage). Current stock/value use
 * the Postgres helper `get_current_inventory` when available and fall back to
 * the client-side FIFO computation from `@/lib/inventory/fifo` otherwise.
 * Writes follow the app-wide contract: client UUIDs, soft deletes, RLS.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeCurrentInventory,
  planFifoRemoval,
  type CurrentInventoryRow,
  type FifoTransaction,
  type OpenLot,
} from '@/lib/inventory/fifo';

export const INVENTORY_IMAGES_BUCKET = 'inventory-images';

export interface MasterItemRecord {
  id: string;
  name: string;
  unit: string;
  image_path: string | null;
  created_at: string;
}

export async function fetchMasterItems(
  supabase: SupabaseClient,
  businessId: string,
): Promise<MasterItemRecord[]> {
  const { data, error } = await supabase
    .from('master_items')
    .select('id, name, unit, image_path, created_at')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .order('name', { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as MasterItemRecord[];
}

interface RpcInventoryRow {
  master_item_id: string;
  name: string;
  unit: string;
  image_path: string | null;
  current_quantity: number;
  current_value: number;
  last_transaction_at: string | null;
}

interface DbTransactionRow {
  id: string;
  master_item_id: string;
  transaction_type: 'add' | 'remove';
  quantity: number;
  unit_price: number;
  remaining_quantity: number;
  transaction_date: string;
}

/**
 * Current inventory per item: prefers the server-side FIFO helper
 * (`get_current_inventory`), falling back to a client-side computation over
 * raw transactions when the RPC is unavailable.
 */
export async function fetchCurrentInventory(
  supabase: SupabaseClient,
  businessId: string,
): Promise<CurrentInventoryRow[]> {
  const { data, error } = await supabase.rpc('get_current_inventory', {
    p_business_id: businessId,
  });
  if (!error && data) {
    return (data as RpcInventoryRow[]).map((row) => ({
      masterItemId: row.master_item_id,
      name: row.name,
      unit: row.unit,
      imagePath: row.image_path,
      currentQuantity: Number(row.current_quantity),
      currentValue: Number(row.current_value),
      lastTransactionAt: row.last_transaction_at,
    }));
  }
  // Fallback: compute FIFO stock/value client-side from raw transactions.
  const [items, transactions] = await Promise.all([
    fetchMasterItems(supabase, businessId),
    fetchTransactions(supabase, businessId),
  ]);
  return computeCurrentInventory(
    items.map((item) => ({
      id: item.id,
      name: item.name,
      unit: item.unit,
      imagePath: item.image_path,
    })),
    transactions,
  );
}

async function fetchTransactions(
  supabase: SupabaseClient,
  businessId: string,
): Promise<FifoTransaction[]> {
  const { data, error } = await supabase
    .from('inventory_transactions')
    .select(
      'id, master_item_id, transaction_type, quantity, unit_price, remaining_quantity, transaction_date',
    )
    .eq('business_id', businessId)
    .is('deleted_at', null);
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as DbTransactionRow[]).map((row) => ({
    id: row.id,
    masterItemId: row.master_item_id,
    transactionType: row.transaction_type,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    remainingQuantity: Number(row.remaining_quantity),
    transactionDate: row.transaction_date,
  }));
}

/** Distinct master_item_ids that have live transactions (delete blocking). */
export async function fetchItemIdsWithTransactions(
  supabase: SupabaseClient,
  businessId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('inventory_transactions')
    .select('master_item_id')
    .eq('business_id', businessId)
    .is('deleted_at', null);
  if (error) {
    throw new Error(error.message);
  }
  return new Set(((data ?? []) as { master_item_id: string }[]).map((r) => r.master_item_id));
}

/** Records an `add` transaction: a new FIFO lot with remaining = quantity. */
export async function recordAddTransaction(
  supabase: SupabaseClient,
  businessId: string,
  userId: string,
  masterItemId: string,
  quantity: number,
  unitPrice: number,
  notes: string | null,
): Promise<void> {
  const { error } = await supabase.from('inventory_transactions').insert({
    id: crypto.randomUUID(),
    business_id: businessId,
    master_item_id: masterItemId,
    transaction_type: 'add',
    quantity,
    unit_price: unitPrice,
    remaining_quantity: quantity,
    notes,
    created_by: userId,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** Raised when a remove exceeds the stock covered by open FIFO lots. */
export class InsufficientStockError extends Error {
  constructor() {
    super('insufficient stock');
    this.name = 'InsufficientStockError';
  }
}

/**
 * Records a `remove` transaction, consuming the oldest open add lots
 * (FIFO) by decrementing their remaining_quantity. Throws
 * {@link InsufficientStockError} when the open lots cannot cover the quantity.
 */
export async function recordRemoveTransaction(
  supabase: SupabaseClient,
  businessId: string,
  userId: string,
  masterItemId: string,
  quantity: number,
  notes: string | null,
): Promise<void> {
  const { data, error } = await supabase
    .from('inventory_transactions')
    .select('id, remaining_quantity, unit_price, transaction_date')
    .eq('business_id', businessId)
    .eq('master_item_id', masterItemId)
    .eq('transaction_type', 'add')
    .gt('remaining_quantity', 0)
    .is('deleted_at', null)
    .order('transaction_date', { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  const lots: OpenLot[] = ((data ?? []) as {
    id: string;
    remaining_quantity: number;
    unit_price: number;
    transaction_date: string;
  }[]).map((row) => ({
    id: row.id,
    remainingQuantity: Number(row.remaining_quantity),
    unitPrice: Number(row.unit_price),
    transactionDate: row.transaction_date,
  }));

  const plan = planFifoRemoval(lots, quantity);
  if (plan === null) {
    throw new InsufficientStockError();
  }

  const { error: insertError } = await supabase.from('inventory_transactions').insert({
    id: crypto.randomUUID(),
    business_id: businessId,
    master_item_id: masterItemId,
    transaction_type: 'remove',
    quantity,
    // FIFO cost per removed unit — informational, not a lot.
    unit_price: quantity > 0 ? Math.round((plan.removedValue / quantity) * 100) / 100 : 0,
    remaining_quantity: 0,
    notes,
    created_by: userId,
  });
  if (insertError) {
    throw new Error(insertError.message);
  }

  for (const consumption of plan.consumptions) {
    const { error: updateError } = await supabase
      .from('inventory_transactions')
      .update({ remaining_quantity: consumption.newRemainingQuantity })
      .eq('id', consumption.lotId);
    if (updateError) {
      throw new Error(updateError.message);
    }
  }
}

export async function createMasterItem(
  supabase: SupabaseClient,
  businessId: string,
  name: string,
  unit: string,
  imagePath: string | null,
): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await supabase.from('master_items').insert({
    id,
    business_id: businessId,
    name: name.trim(),
    unit,
    image_path: imagePath,
  });
  if (error) {
    throw new Error(error.message);
  }
  return id;
}

export async function updateMasterItem(
  supabase: SupabaseClient,
  itemId: string,
  name: string,
  unit: string,
  imagePath: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('master_items')
    .update({ name: name.trim(), unit, image_path: imagePath })
    .eq('id', itemId);
  if (error) {
    throw new Error(error.message);
  }
}

/** Tombstone delete — callers must verify the item has no transactions first. */
export async function deleteMasterItem(supabase: SupabaseClient, itemId: string): Promise<void> {
  const { error } = await supabase
    .from('master_items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', itemId);
  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Uploads a compressed item photo to the private `inventory-images` bucket
 * using the `{business_id}/{entity_id}/{filename}` path convention (§2).
 */
export async function uploadItemImage(
  supabase: SupabaseClient,
  businessId: string,
  itemId: string,
  blob: Blob,
): Promise<string> {
  const path = `${businessId}/${itemId}/${Date.now()}.webp`;
  const { error } = await supabase.storage
    .from(INVENTORY_IMAGES_BUCKET)
    .upload(path, blob, { contentType: 'image/webp', upsert: false });
  if (error) {
    throw new Error(error.message);
  }
  return path;
}

/** Signed URLs for a private-bucket image set, keyed by storage path. */
export async function createImageUrls(
  supabase: SupabaseClient,
  paths: string[],
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (paths.length === 0) {
    return urls;
  }
  const { data, error } = await supabase.storage
    .from(INVENTORY_IMAGES_BUCKET)
    .createSignedUrls(paths, 3600);
  if (error || !data) {
    return urls;
  }
  for (const entry of data) {
    if (entry.signedUrl && entry.path) {
      urls.set(entry.path, entry.signedUrl);
    }
  }
  return urls;
}
