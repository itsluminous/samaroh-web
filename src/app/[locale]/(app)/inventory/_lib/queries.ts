/**
 * Supabase data access for the inventory section (master_items,
 * inventory_transactions). Current stock/value use the Postgres helper
 * `get_current_inventory` when available and fall back to the client-side
 * FIFO computation from `@/lib/inventory/fifo` otherwise. Item photos are
 * referenced by `drive_image_id` (Google Drive, anyone-with-link — see
 * `@/lib/images/drive`); the former `inventory-images` Storage bucket is
 * gone and `master_items.image_path` was dropped from the server schema
 * (Android keeps it device-local only — ADR-065).
 * Writes follow the app-wide contract: client UUIDs, soft deletes, RLS.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeCurrentInventory,
  planFifoRemoval,
  replayFifo,
  type CurrentInventoryRow,
  type FifoTransaction,
  type OpenLot,
  type ReplayUpdate,
} from '@/lib/inventory/fifo';
import { insertWithOutbox, updateWithOutbox } from '@/lib/outbox/mutate';

export interface MasterItemRecord {
  id: string;
  name: string;
  unit: string;
  drive_image_id: string | null;
  created_at: string;
}

export async function fetchMasterItems(
  supabase: SupabaseClient,
  businessId: string,
): Promise<MasterItemRecord[]> {
  const { data, error } = await supabase
    .from('master_items')
    .select('id, name, unit, drive_image_id, created_at')
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
 * raw transactions when the RPC is unavailable. The frozen RPC does not
 * return `drive_image_id`, so photo references are merged in from
 * `master_items` on both paths.
 */
export async function fetchCurrentInventory(
  supabase: SupabaseClient,
  businessId: string,
): Promise<CurrentInventoryRow[]> {
  const [items, rpc] = await Promise.all([
    fetchMasterItems(supabase, businessId),
    supabase.rpc('get_current_inventory', { p_business_id: businessId }),
  ]);
  if (!rpc.error && rpc.data) {
    const driveIdByItemId = new Map(items.map((item) => [item.id, item.drive_image_id]));
    return (rpc.data as RpcInventoryRow[]).map((row) => ({
      masterItemId: row.master_item_id,
      name: row.name,
      unit: row.unit,
      driveImageId: driveIdByItemId.get(row.master_item_id) ?? null,
      currentQuantity: Number(row.current_quantity),
      currentValue: Number(row.current_value),
      lastTransactionAt: row.last_transaction_at,
    }));
  }
  // Fallback: compute FIFO stock/value client-side from raw transactions.
  const transactions = await fetchTransactions(supabase, businessId);
  return computeCurrentInventory(
    items.map((item) => ({
      id: item.id,
      name: item.name,
      unit: item.unit,
      driveImageId: item.drive_image_id,
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

/** A single master item by id (item detail page); null when missing/deleted. */
export async function fetchMasterItem(
  supabase: SupabaseClient,
  businessId: string,
  itemId: string,
): Promise<MasterItemRecord | null> {
  const { data, error } = await supabase
    .from('master_items')
    .select('id, name, unit, drive_image_id, created_at')
    .eq('business_id', businessId)
    .eq('id', itemId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return (data as MasterItemRecord | null) ?? null;
}

export interface ItemTransactionRecord {
  id: string;
  transactionType: 'add' | 'remove';
  quantity: number;
  /** Per-unit price; for removes this is the FIFO cost per removed unit. */
  unitPrice: number;
  remainingQuantity: number;
  transactionDate: string;
  notes: string | null;
}

/**
 * All live transactions for one item, newest first (item detail history).
 * The full list is fetched and paginated client-side: per-item histories are
 * small, and the guest-mode local client has no `range`/count support.
 */
export async function fetchItemTransactions(
  supabase: SupabaseClient,
  businessId: string,
  itemId: string,
): Promise<ItemTransactionRecord[]> {
  const { data, error } = await supabase
    .from('inventory_transactions')
    .select(
      'id, transaction_type, quantity, unit_price, remaining_quantity, transaction_date, notes',
    )
    .eq('business_id', businessId)
    .eq('master_item_id', itemId)
    .is('deleted_at', null)
    .order('transaction_date', { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as {
    id: string;
    transaction_type: 'add' | 'remove';
    quantity: number;
    unit_price: number;
    remaining_quantity: number;
    transaction_date: string;
    notes: string | null;
  }[]).map((row) => ({
    id: row.id,
    transactionType: row.transaction_type,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    remainingQuantity: Number(row.remaining_quantity),
    transactionDate: row.transaction_date,
    notes: row.notes,
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
  itemName?: string,
): Promise<void> {
  // Add transactions are self-contained, so they queue offline; removes need
  // a live read of open FIFO lots and stay online-only (docs/decisions.md).
  await insertWithOutbox(supabase, {
    module: 'inventory',
    table: 'inventory_transactions',
    row: {
      id: crypto.randomUUID(),
      business_id: businessId,
      master_item_id: masterItemId,
      transaction_type: 'add',
      quantity,
      unit_price: unitPrice,
      remaining_quantity: quantity,
      notes,
      created_by: userId,
    },
    label: itemName ?? notes ?? masterItemId,
  });
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
 * (FIFO) by decrementing their remaining_quantity. Returns the FIFO cost of
 * the removed quantity (for the success feedback). Throws
 * {@link InsufficientStockError} when the open lots cannot cover the quantity.
 */
export async function recordRemoveTransaction(
  supabase: SupabaseClient,
  businessId: string,
  userId: string,
  masterItemId: string,
  quantity: number,
  notes: string | null,
): Promise<number> {
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
  return plan.removedValue;
}

/**
 * Raised when an edit/delete would make some historical remove exceed the
 * stock available at its point in time (stock would go negative in the past).
 */
export class HistoricalNegativeStockError extends Error {
  constructor() {
    super('historical stock would go negative');
    this.name = 'HistoricalNegativeStockError';
  }
}

/** One item's live transactions in the pure-FIFO shape the replay consumes. */
async function fetchItemFifoTransactions(
  supabase: SupabaseClient,
  businessId: string,
  itemId: string,
): Promise<FifoTransaction[]> {
  const txns = await fetchItemTransactions(supabase, businessId, itemId);
  return txns.map((txn) => ({
    id: txn.id,
    masterItemId: itemId,
    transactionType: txn.transactionType,
    quantity: txn.quantity,
    unitPrice: txn.unitPrice,
    remainingQuantity: txn.remainingQuantity,
    transactionDate: txn.transactionDate,
  }));
}

/**
 * Persists a replay's column patches through the outbox-aware update path
 * (offline queues + guest Dexie both work unchanged). `baseUpdatedAt` is null:
 * FIFO columns are derived state, so replay applies them blindly.
 */
async function persistReplayUpdates(
  supabase: SupabaseClient,
  updates: ReplayUpdate[],
  label: string,
): Promise<void> {
  for (const update of updates) {
    const patch: Record<string, unknown> = {};
    if (update.remainingQuantity !== undefined) {
      patch.remaining_quantity = update.remainingQuantity;
    }
    if (update.unitPrice !== undefined) {
      patch.unit_price = update.unitPrice;
    }
    await updateWithOutbox(supabase, {
      module: 'inventory',
      table: 'inventory_transactions',
      entityId: update.id,
      patch,
      baseUpdatedAt: null,
      label,
    });
  }
}

/** Editable fields of an inventory transaction (item-detail row menu). */
export interface TransactionEdit {
  quantity: number;
  /** New per-unit price — add transactions only (removes derive theirs from FIFO). */
  unitPrice?: number;
  notes: string | null;
}

/**
 * Edits one transaction and replays the item's whole live history to rewrite
 * every FIFO-derived column (add lots' remaining_quantity, removes'
 * cost-per-unit). Throws {@link HistoricalNegativeStockError} — persisting
 * NOTHING — when the edited history would drive stock negative at any point.
 * All writes go through the outbox-aware update path.
 */
export async function updateInventoryTransaction(
  supabase: SupabaseClient,
  businessId: string,
  itemId: string,
  txnId: string,
  edit: TransactionEdit,
  label: string,
): Promise<void> {
  const txns = await fetchItemFifoTransactions(supabase, businessId, itemId);
  const target = txns.find((txn) => txn.id === txnId);
  if (!target) {
    throw new Error('transaction not found');
  }
  const editedHistory = txns.map((txn) =>
    txn.id === txnId
      ? {
          ...txn,
          quantity: edit.quantity,
          unitPrice:
            txn.transactionType === 'add' && edit.unitPrice !== undefined
              ? edit.unitPrice
              : txn.unitPrice,
        }
      : txn,
  );
  const updates = replayFifo(editedHistory);
  if (updates === null) {
    throw new HistoricalNegativeStockError();
  }

  // The edited row's own patch merges the user fields with its replay fields.
  const targetReplay = updates.find((u) => u.id === txnId);
  const siblingUpdates = updates.filter((u) => u.id !== txnId);
  const targetPatch: Record<string, unknown> = {
    quantity: edit.quantity,
    notes: edit.notes,
  };
  if (target.transactionType === 'add' && edit.unitPrice !== undefined) {
    targetPatch.unit_price = edit.unitPrice;
  }
  if (targetReplay?.remainingQuantity !== undefined) {
    targetPatch.remaining_quantity = targetReplay.remainingQuantity;
  }
  if (targetReplay?.unitPrice !== undefined) {
    targetPatch.unit_price = targetReplay.unitPrice;
  }

  await updateWithOutbox(supabase, {
    module: 'inventory',
    table: 'inventory_transactions',
    entityId: txnId,
    patch: targetPatch,
    baseUpdatedAt: null,
    label,
  });
  await persistReplayUpdates(supabase, siblingUpdates, label);
}

/**
 * Tombstone-deletes one transaction and replays the remaining live history
 * (same engine as {@link updateInventoryTransaction}). Throws
 * {@link HistoricalNegativeStockError} — persisting NOTHING — when removing
 * the row would drive stock negative at any point (e.g. deleting an add lot
 * that later removes already consumed). Sibling rewrites land first so a
 * mid-way failure leaves the delete unapplied and the history consistent.
 */
export async function deleteInventoryTransaction(
  supabase: SupabaseClient,
  businessId: string,
  itemId: string,
  txnId: string,
  label: string,
): Promise<void> {
  const txns = await fetchItemFifoTransactions(supabase, businessId, itemId);
  const remaining = txns.filter((txn) => txn.id !== txnId);
  if (remaining.length === txns.length) {
    throw new Error('transaction not found');
  }
  const updates = replayFifo(remaining);
  if (updates === null) {
    throw new HistoricalNegativeStockError();
  }
  await persistReplayUpdates(supabase, updates, label);
  await updateWithOutbox(supabase, {
    module: 'inventory',
    table: 'inventory_transactions',
    entityId: txnId,
    patch: { deleted_at: new Date().toISOString() },
    baseUpdatedAt: null,
    label,
  });
}

/**
 * Creates a master item. Photos are not settable from web: they upload to
 * Google Drive from the Android app, which owns `drive_image_id`
 * (see docs/decisions.md — Drive-first item images).
 */
export async function createMasterItem(
  supabase: SupabaseClient,
  businessId: string,
  name: string,
  unit: string,
): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await supabase.from('master_items').insert({
    id,
    business_id: businessId,
    name: name.trim(),
    unit,
  });
  if (error) {
    throw new Error(error.message);
  }
  return id;
}

/**
 * Updates a master item's name/unit. Never touches `drive_image_id` —
 * the Android app owns the photo column.
 */
export async function updateMasterItem(
  supabase: SupabaseClient,
  itemId: string,
  name: string,
  unit: string,
): Promise<void> {
  const { error } = await supabase
    .from('master_items')
    .update({ name: name.trim(), unit })
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
