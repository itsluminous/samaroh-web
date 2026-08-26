import {
  emptyPermissions,
  hasPerm,
  matchingPreset,
  normalizePermissions,
  PERMISSION_MATRIX,
  presetPermissions,
} from '@/lib/permissions/permissions';
import schema from '../shared/permissions/permissions-schema.json';

describe('permission matrix ↔ shared schema parity', () => {
  it('mirrors every module and action from shared/permissions/permissions-schema.json', () => {
    const schemaModules = schema.properties as Record<string, { properties: Record<string, unknown> }>;
    expect(new Set(PERMISSION_MATRIX.map((m) => m.module))).toEqual(new Set(Object.keys(schemaModules)));
    for (const { module, actions } of PERMISSION_MATRIX) {
      expect(new Set(actions)).toEqual(new Set(Object.keys(schemaModules[module]!.properties)));
    }
  });
});

describe('normalizePermissions', () => {
  it('defaults every action to false for junk input', () => {
    for (const raw of [null, undefined, 'nope', 42, {}]) {
      expect(normalizePermissions(raw)).toEqual(emptyPermissions());
    }
  });

  it('keeps only explicit true values', () => {
    const perms = normalizePermissions({
      booking: { view: true, edit: 'yes', delete: 1 },
      reports: { view: true },
      bogus_module: { anything: true },
    });
    expect(hasPerm(perms, 'booking', 'view')).toBe(true);
    expect(hasPerm(perms, 'booking', 'edit')).toBe(false);
    expect(hasPerm(perms, 'booking', 'delete')).toBe(false);
    expect(hasPerm(perms, 'reports', 'view')).toBe(true);
  });
});

describe('presets', () => {
  it('viewer = view-only on the 3 sections', () => {
    const p = presetPermissions('viewer');
    expect(hasPerm(p, 'booking', 'view')).toBe(true);
    expect(hasPerm(p, 'booking', 'create')).toBe(false);
    expect(hasPerm(p, 'reports', 'view')).toBe(false);
  });

  it('staff adds create; manager adds edit/delete/payments/reports', () => {
    const staff = presetPermissions('staff');
    expect(hasPerm(staff, 'inventory', 'create')).toBe(true);
    expect(hasPerm(staff, 'inventory', 'edit')).toBe(false);
    const manager = presetPermissions('manager');
    expect(hasPerm(manager, 'booking', 'record_payment')).toBe(true);
    expect(hasPerm(manager, 'reports', 'view')).toBe(true);
    // Members/business management stays owner territory even for managers.
    expect(hasPerm(manager, 'settings', 'manage_members')).toBe(false);
  });

  it('round-trips through matchingPreset', () => {
    for (const preset of ['viewer', 'staff', 'manager'] as const) {
      expect(matchingPreset(presetPermissions(preset))).toBe(preset);
    }
    const custom = presetPermissions('viewer');
    custom.reports.view = true;
    expect(matchingPreset(custom)).toBeNull();
  });
});
