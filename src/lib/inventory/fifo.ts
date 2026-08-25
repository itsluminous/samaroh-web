/**
 * FIFO inventory computations (spec §4.3 / schema §2). Mirrors the Postgres
 * helper `get_current_inventory`: current stock = Σ(add qty) − Σ(remove qty);
 * current value = Σ(remaining_quantity × unit_price) over open add lots.
 * `remove` transactions consume the oldest open add lots, decrementing their
 * remaining_quantity. Pure functions — the Supabase side effects live in the
 * feature query layers.
 */

export type TransactionType = 'add' | 'remove';

export interface FifoTransaction {
  id: string;
  masterItemId: string;
  transactionType: TransactionType;
  quantity: number;
  unitPrice: number;
  remainingQuantity: number;
  /** ISO timestamp. */
  transactionDate: string;
}

export interface OpenLot {
  id: string;
  remainingQuantity: number;
  unitPrice: number;
  /** ISO timestamp — lots are consumed oldest first. */
  transactionDate: string;
}

const QTY_EPSILON = 1e-9;

function round3(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return rounded === 0 ? 0 : rounded;
}

function round2(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

/** Current stock for one item: Σ(add qty) − Σ(remove qty). */
export function computeCurrentStock(transactions: FifoTransaction[]): number {
  return round3(
    transactions.reduce(
      (sum, t) => sum + (t.transactionType === 'add' ? t.quantity : -t.quantity),
      0,
    ),
  );
}

/** Current FIFO value for one item: Σ(remaining × unit price) over open add lots. */
export function computeFifoValue(transactions: FifoTransaction[]): number {
  return round2(
    transactions.reduce(
      (sum, t) =>
        sum + (t.transactionType === 'add' ? t.remainingQuantity * t.unitPrice : 0),
      0,
    ),
  );
}

/** True when `quantity` can be removed from `currentStock` (cannot remove more than stock). */
export function canRemoveQuantity(currentStock: number, quantity: number): boolean {
  return Number.isFinite(quantity) && quantity > 0 && quantity <= currentStock + QTY_EPSILON;
}

export interface LotConsumption {
  lotId: string;
  consumedQuantity: number;
  newRemainingQuantity: number;
  unitPrice: number;
}

export interface FifoRemovalPlan {
  consumptions: LotConsumption[];
  /** FIFO cost of the removed quantity. */
  removedValue: number;
}

/**
 * Plans a FIFO removal against open add lots (oldest first). Returns the
 * per-lot updates to persist, or null when the open lots cannot cover the
 * requested quantity (insufficient stock).
 */
export function planFifoRemoval(openLots: OpenLot[], quantity: number): FifoRemovalPlan | null {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }
  const lots = [...openLots]
    .filter((lot) => lot.remainingQuantity > 0)
    .sort((a, b) => (a.transactionDate < b.transactionDate ? -1 : 1));

  let remainingToRemove = quantity;
  let removedValue = 0;
  const consumptions: LotConsumption[] = [];

  for (const lot of lots) {
    if (remainingToRemove <= QTY_EPSILON) {
      break;
    }
    const consumed = Math.min(remainingToRemove, lot.remainingQuantity);
    remainingToRemove = round3(remainingToRemove - consumed);
    removedValue += consumed * lot.unitPrice;
    consumptions.push({
      lotId: lot.id,
      consumedQuantity: round3(consumed),
      newRemainingQuantity: round3(lot.remainingQuantity - consumed),
      unitPrice: lot.unitPrice,
    });
  }

  if (remainingToRemove > QTY_EPSILON) {
    return null;
  }
  return { consumptions, removedValue: round2(removedValue) };
}

export interface MasterItemLike {
  id: string;
  name: string;
  unit: string;
  imagePath: string | null;
}

export interface CurrentInventoryRow {
  masterItemId: string;
  name: string;
  unit: string;
  imagePath: string | null;
  currentQuantity: number;
  currentValue: number;
  /** ISO timestamp of the latest transaction, or null when none. */
  lastTransactionAt: string | null;
}

/**
 * Client-side fallback matching the Postgres `get_current_inventory` output:
 * one row per master item with FIFO stock, value and last-transaction time.
 */
export function computeCurrentInventory(
  items: MasterItemLike[],
  transactions: FifoTransaction[],
): CurrentInventoryRow[] {
  const byItem = new Map<string, FifoTransaction[]>();
  for (const t of transactions) {
    const list = byItem.get(t.masterItemId);
    if (list) {
      list.push(t);
    } else {
      byItem.set(t.masterItemId, [t]);
    }
  }
  return items.map((item) => {
    const txns = byItem.get(item.id) ?? [];
    const lastTransactionAt = txns.reduce<string | null>(
      (latest, t) => (latest === null || t.transactionDate > latest ? t.transactionDate : latest),
      null,
    );
    return {
      masterItemId: item.id,
      name: item.name,
      unit: item.unit,
      imagePath: item.imagePath,
      currentQuantity: computeCurrentStock(txns),
      currentValue: computeFifoValue(txns),
      lastTransactionAt,
    };
  });
}
