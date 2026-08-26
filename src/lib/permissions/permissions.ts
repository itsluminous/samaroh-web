/**
 * Member permission model — mirrors shared/permissions/permissions-schema.json
 * (the frozen Wave-0 contract). Every action defaults to false when absent;
 * owners bypass this object entirely (implicit full access, enforced by RLS).
 */

export type PermissionModule = 'booking' | 'expenses' | 'inventory' | 'reports' | 'settings';

export interface MemberPermissions {
  booking: {
    view: boolean;
    create: boolean;
    edit: boolean;
    delete: boolean;
    record_payment: boolean;
    generate_invoice: boolean;
  };
  expenses: {
    view: boolean;
    create: boolean;
    edit: boolean;
    delete: boolean;
    manage_parties: boolean;
  };
  inventory: {
    view: boolean;
    create: boolean;
    edit: boolean;
    delete: boolean;
    manage_master_items: boolean;
  };
  reports: {
    view: boolean;
  };
  settings: {
    manage_business: boolean;
    manage_members: boolean;
    gcal_sync: boolean;
  };
}

/** Matrix rows in display order — drives the permission editor UI. */
export const PERMISSION_MATRIX: ReadonlyArray<{
  module: PermissionModule;
  actions: readonly string[];
}> = [
  { module: 'booking', actions: ['view', 'create', 'edit', 'delete', 'record_payment', 'generate_invoice'] },
  { module: 'expenses', actions: ['view', 'create', 'edit', 'delete', 'manage_parties'] },
  { module: 'inventory', actions: ['view', 'create', 'edit', 'delete', 'manage_master_items'] },
  { module: 'reports', actions: ['view'] },
  { module: 'settings', actions: ['manage_business', 'manage_members', 'gcal_sync'] },
];

export function emptyPermissions(): MemberPermissions {
  return {
    booking: { view: false, create: false, edit: false, delete: false, record_payment: false, generate_invoice: false },
    expenses: { view: false, create: false, edit: false, delete: false, manage_parties: false },
    inventory: { view: false, create: false, edit: false, delete: false, manage_master_items: false },
    reports: { view: false },
    settings: { manage_business: false, manage_members: false, gcal_sync: false },
  };
}

/** Normalises a permissions jsonb blob from the DB into the full shape. */
export function normalizePermissions(raw: unknown): MemberPermissions {
  const base = emptyPermissions();
  if (!raw || typeof raw !== 'object') {
    return base;
  }
  const source = raw as Record<string, Record<string, unknown>>;
  for (const { module, actions } of PERMISSION_MATRIX) {
    const mod = source[module];
    if (!mod || typeof mod !== 'object') {
      continue;
    }
    const target = base[module] as Record<string, boolean>;
    for (const action of actions) {
      if (mod[action] === true) {
        target[action] = true;
      }
    }
  }
  return base;
}

/** True when the permissions blob grants `module.action` (owners bypass this). */
export function hasPerm(perms: MemberPermissions, module: PermissionModule, action: string): boolean {
  const mod = perms[module] as Record<string, boolean>;
  return mod?.[action] === true;
}

export type PresetKey = 'viewer' | 'staff' | 'manager';

/**
 * The three quick presets from the spec (§3):
 * Viewer = all view; Staff = view + create; Manager = everything except
 * settings/members management.
 */
export function presetPermissions(preset: PresetKey): MemberPermissions {
  const p = emptyPermissions();
  p.booking.view = true;
  p.expenses.view = true;
  p.inventory.view = true;
  if (preset === 'viewer') {
    return p;
  }
  p.booking.create = true;
  p.expenses.create = true;
  p.inventory.create = true;
  if (preset === 'staff') {
    return p;
  }
  // manager
  p.booking.edit = true;
  p.booking.delete = true;
  p.booking.record_payment = true;
  p.booking.generate_invoice = true;
  p.expenses.edit = true;
  p.expenses.delete = true;
  p.expenses.manage_parties = true;
  p.inventory.edit = true;
  p.inventory.delete = true;
  p.inventory.manage_master_items = true;
  p.reports.view = true;
  return p;
}

/** Which preset (if any) a permissions object matches exactly. */
export function matchingPreset(perms: MemberPermissions): PresetKey | null {
  const presets: PresetKey[] = ['viewer', 'staff', 'manager'];
  for (const key of presets) {
    if (JSON.stringify(presetPermissions(key)) === JSON.stringify(perms)) {
      return key;
    }
  }
  return null;
}
