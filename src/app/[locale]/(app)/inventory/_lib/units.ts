/**
 * Inventory units, bound to the canonical shared contract
 * (`shared/units.json` — same single-source-of-truth pattern as
 * `shared/event-types.json`).
 *
 * Contract (see the JSON `$comment`):
 *  - `wire` is the EXACT string stored in `master_items.unit`. The original
 *    values (`pcs`, `qty`, `kg`, `litre`) plus free-text custom are frozen.
 *  - Any stored unit string that matches no wire value is a custom unit and
 *    renders verbatim.
 *  - The picker shows groups in file order (Count/Weight/Liquid/Distance)
 *    with units in file order, then the Custom option last.
 *  - `label_key` values are full catalog keys (`inventory.masterlist.*`);
 *    this module re-exposes them relative to the `inventory` namespace so
 *    components using `useTranslations('inventory')` can resolve them.
 *
 * Parity with the shared file is enforced by tests
 * (`__tests__/inventory-units.test.tsx` — web counterpart of Android's
 * UnitCatalogParityTest).
 */

import unitsJson from '../../../../../../shared/units.json';

export interface UnitOption {
  /** Stable identifier within the catalog (not stored). */
  key: string;
  /** Exact string stored in `master_items.unit`. */
  wire: string;
  /** Catalog key relative to the `inventory` namespace. */
  labelKey: string;
}

export interface UnitGroup {
  key: string;
  /** Group header catalog key, relative to the `inventory` namespace. */
  labelKey: string;
  units: UnitOption[];
}

const NAMESPACE_PREFIX = 'inventory.';

/** `inventory.masterlist.unit_kg` → `masterlist.unit_kg` (relative to `inventory`). */
function relativeLabelKey(labelKey: string): string {
  if (!labelKey.startsWith(NAMESPACE_PREFIX)) {
    throw new Error(`shared/units.json label_key outside inventory namespace: ${labelKey}`);
  }
  return labelKey.slice(NAMESPACE_PREFIX.length);
}

/** Grouped picker options, in the shared file's order. */
export const UNIT_GROUPS: UnitGroup[] = unitsJson.groups.map((group) => ({
  key: group.key,
  labelKey: relativeLabelKey(group.label_key),
  units: group.units.map((unit) => ({
    key: unit.key,
    wire: unit.wire,
    labelKey: relativeLabelKey(unit.label_key),
  })),
}));

/** Label key (relative to `inventory`) for the Custom picker option. */
export const CUSTOM_UNIT_LABEL_KEY: string = relativeLabelKey(unitsJson.custom.label_key);

/**
 * Frozen wire values from before the grouped catalog existed (schema §2).
 * They must always exist in the shared file — guarded by the parity test.
 */
export const LEGACY_WIRE_VALUES = ['pcs', 'qty', 'kg', 'litre'] as const;

const LABEL_KEY_BY_WIRE: Map<string, string> = new Map(
  UNIT_GROUPS.flatMap((group) => group.units.map((unit) => [unit.wire, unit.labelKey])),
);

/** True when the stored unit is a catalog wire value (not free-text custom). */
export function isKnownUnit(unit: string): boolean {
  return LABEL_KEY_BY_WIRE.has(unit);
}

/**
 * Catalog key (relative to the `inventory` namespace) for a stored unit, or
 * null for a custom free-text unit (render the stored string verbatim).
 */
export function unitLabelKey(unit: string): string | null {
  return LABEL_KEY_BY_WIRE.get(unit) ?? null;
}
