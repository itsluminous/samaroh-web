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

  it('defaults view_amounts to TRUE when absent (schema exception)', () => {
    // Pre-existing permissions blobs written before amounts-visibility.
    const legacy = normalizePermissions({ booking: { view: true }, reports: { view: true } });
    for (const mod of ['booking', 'expenses', 'inventory', 'reports'] as const) {
      expect(hasPerm(legacy, mod, 'view_amounts')).toBe(true);
    }
    // Junk / missing module blobs too.
    expect(hasPerm(normalizePermissions(null), 'expenses', 'view_amounts')).toBe(true);
    expect(hasPerm(normalizePermissions({}), 'inventory', 'view_amounts')).toBe(true);
  });

  it('masks only on explicit false (non-boolean junk stays true)', () => {
    const perms = normalizePermissions({
      booking: { view: true, view_amounts: false },
      expenses: { view_amounts: 'no' },
      inventory: { view_amounts: 0 },
      reports: { view: true, view_amounts: true },
    });
    expect(hasPerm(perms, 'booking', 'view_amounts')).toBe(false);
    expect(hasPerm(perms, 'expenses', 'view_amounts')).toBe(true);
    expect(hasPerm(perms, 'inventory', 'view_amounts')).toBe(true);
    expect(hasPerm(perms, 'reports', 'view_amounts')).toBe(true);
  });

  it('round-trips an explicit view_amounts=false through serialization', () => {
    const perms = normalizePermissions({ booking: { view: true, view_amounts: false } });
    const again = normalizePermissions(JSON.parse(JSON.stringify(perms)));
    expect(again).toEqual(perms);
    expect(hasPerm(again, 'booking', 'view_amounts')).toBe(false);
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

  it('all presets leave view_amounts true (owner toggles it off per member)', () => {
    for (const preset of ['viewer', 'staff', 'manager'] as const) {
      const p = presetPermissions(preset);
      for (const mod of ['booking', 'expenses', 'inventory', 'reports'] as const) {
        expect(hasPerm(p, mod, 'view_amounts')).toBe(true);
      }
    }
    // Toggling any view_amounts off breaks the exact-preset match.
    const custom = presetPermissions('viewer');
    custom.booking.view_amounts = false;
    expect(matchingPreset(custom)).toBeNull();
  });
});
