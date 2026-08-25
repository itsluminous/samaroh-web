/**
 * Built-in inventory units. Stored values are stable codes ('pcs', 'qty',
 * 'kg', 'litre' — see schema §2); anything else is treated as a custom
 * free-text unit and displayed as-is.
 */

export const BUILT_IN_UNITS = ['pcs', 'qty', 'kg', 'litre'] as const;
export type BuiltInUnit = (typeof BUILT_IN_UNITS)[number];

export function isBuiltInUnit(unit: string): unit is BuiltInUnit {
  return (BUILT_IN_UNITS as readonly string[]).includes(unit);
}

/** Catalog key suffix (under `inventory.master.`) for a built-in unit code. */
export function unitLabelKey(unit: BuiltInUnit): string {
  switch (unit) {
    case 'pcs':
      return 'unit_pieces';
    case 'qty':
      return 'unit_quantity';
    case 'kg':
      return 'unit_kg';
    case 'litre':
      return 'unit_litre';
  }
}
