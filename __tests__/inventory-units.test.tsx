/**
 * Shared unit catalog (shared/units.json) binding — web counterpart of
 * Android's UnitCatalogParityTest plus UI coverage:
 *  - parsing/parity: grouped structure, stable wire values, frozen legacy
 *    values, unique wires, custom fallback;
 *  - localization: every unit/group label key resolves in BOTH generated
 *    catalogs (en + hi);
 *  - grouped render: the master-item dialog dropdown shows the four group
 *    headers with units in file order and Custom last;
 *  - back-compat: legacy stored values preselect their entry, unknown
 *    free-text opens the custom field with the raw value.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '../messages/en.json';
import hi from '../messages/hi.json';
import MasterItemDialog from '@/app/[locale]/(app)/inventory/_components/MasterItemDialog';
import type { MasterItemRecord } from '@/app/[locale]/(app)/inventory/_lib/queries';
import {
  CUSTOM_UNIT_LABEL_KEY,
  LEGACY_WIRE_VALUES,
  UNIT_GROUPS,
  isKnownUnit,
  unitLabelKey,
} from '@/app/[locale]/(app)/inventory/_lib/units';

jest.mock('@/app/[locale]/(app)/inventory/_lib/queries', () => ({
  createMasterItem: jest.fn(),
  updateMasterItem: jest.fn(),
}));

type Messages = typeof en;

/** Resolve a units.ts relative label key (e.g. `masterlist.unit_kg`) in a catalog. */
function resolveLabel(messages: Messages, relativeKey: string): unknown {
  let node: unknown = messages.inventory;
  for (const part of relativeKey.split('.')) {
    if (typeof node !== 'object' || node === null) {
      return undefined;
    }
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

describe('shared unit catalog parity (units.json)', () => {
  it('exposes the four groups in file order with units in file order', () => {
    expect(UNIT_GROUPS.map((g) => g.key)).toEqual(['count', 'weight', 'liquid', 'distance']);
    expect(UNIT_GROUPS.map((g) => g.units.map((u) => u.wire))).toEqual([
      ['pcs', 'qty', 'sets', 'units', 'items', 'boxes', 'packets'],
      ['kg', 'g', 'mg', 'ton'],
      ['litre', 'ml', 'cup'],
      ['m', 'cm', 'mm', 'km', 'ft', 'in'],
    ]);
  });

  it('keeps every wire value unique and non-empty', () => {
    const wires = UNIT_GROUPS.flatMap((g) => g.units.map((u) => u.wire));
    expect(wires).toHaveLength(20);
    expect(new Set(wires).size).toBe(wires.length);
    expect(wires.every((w) => w.trim().length > 0)).toBe(true);
  });

  it('keeps the frozen legacy wire values, with pcs as the first (default) unit', () => {
    for (const legacy of LEGACY_WIRE_VALUES) {
      expect(isKnownUnit(legacy)).toBe(true);
    }
    expect(UNIT_GROUPS[0]?.units[0]?.wire).toBe('pcs');
  });

  it('treats non-wire values as custom free text', () => {
    expect(isKnownUnit('dozen')).toBe(false);
    expect(unitLabelKey('dozen')).toBeNull();
    expect(unitLabelKey('')).toBeNull();
    // Known wires resolve to their catalog keys.
    expect(unitLabelKey('kg')).toBe('masterlist.unit_kg');
    expect(unitLabelKey('g')).toBe('masterlist.unit_grams');
    expect(unitLabelKey('ft')).toBe('masterlist.unit_feet');
  });

  it.each([
    ['en', en],
    ['hi', hi],
  ])('resolves every group/unit/custom label key in the %s catalog', (_locale, messages) => {
    const keys = [
      CUSTOM_UNIT_LABEL_KEY,
      ...UNIT_GROUPS.flatMap((g) => [g.labelKey, ...g.units.map((u) => u.labelKey)]),
    ];
    expect(keys).toHaveLength(1 + 4 + 20);
    for (const key of keys) {
      const label = resolveLabel(messages as Messages, key);
      expect(typeof label).toBe('string');
      expect((label as string).trim().length).toBeGreaterThan(0);
    }
  });

  it('localizes group headers differently in en and hi (real translations)', () => {
    for (const group of UNIT_GROUPS) {
      const enLabel = resolveLabel(en, group.labelKey);
      const hiLabel = resolveLabel(hi as unknown as Messages, group.labelKey);
      expect(enLabel).not.toEqual(hiLabel);
    }
  });
});

const baseDialogProps = {
  open: true,
  items: [] as MasterItemRecord[],
  currentImageUrl: null,
  supabase: null,
  businessId: null,
  onClose: jest.fn(),
  onPickExisting: jest.fn(),
  onSaved: jest.fn(),
};

function renderDialog(item: MasterItemRecord | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <MasterItemDialog {...baseDialogProps} item={item} />
    </NextIntlClientProvider>,
  );
}

function openUnitDropdown() {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: en.inventory.master.unit_label }));
  return within(screen.getByRole('listbox'));
}

describe('master-item dialog grouped unit dropdown', () => {
  it('renders the four group headers with all units in order and Custom last', () => {
    renderDialog(null);
    const listbox = openUnitDropdown();

    const headers = UNIT_GROUPS.map((g) => resolveLabel(en, g.labelKey) as string);
    for (const header of headers) {
      expect(listbox.getByText(header)).toBeInTheDocument();
    }

    // ListSubheader renders as an <li> too — real selectable entries are the
    // ones MUI stamps with data-value.
    const options = listbox
      .getAllByRole('option')
      .filter((o) => o.hasAttribute('data-value'))
      .map((o) => o.textContent);
    const expected = [
      ...UNIT_GROUPS.flatMap((g) => g.units.map((u) => resolveLabel(en, u.labelKey) as string)),
      resolveLabel(en, CUSTOM_UNIT_LABEL_KEY) as string,
    ];
    expect(options).toEqual(expected);
    expect(options).toHaveLength(21);
  });

  it('defaults a new item to pcs with no custom field', () => {
    renderDialog(null);
    expect(
      screen.getByRole('combobox', { name: en.inventory.master.unit_label }),
    ).toHaveTextContent(en.inventory.masterlist.unit_pieces);
    expect(
      screen.queryByLabelText(en.inventory.master.custom_unit_label),
    ).not.toBeInTheDocument();
  });
});

describe('back-compat: stored unit values round-trip', () => {
  const makeItem = (unit: string): MasterItemRecord =>
    ({
      id: 'item1',
      name: 'Basmati Rice',
      unit,
      drive_image_id: null,
      created_at: '2026-01-01T00:00:00Z',
    }) as MasterItemRecord;

  it.each([
    ['pcs', en.inventory.masterlist.unit_pieces],
    ['qty', en.inventory.masterlist.unit_quantity],
    ['kg', en.inventory.masterlist.unit_kg],
    ['litre', en.inventory.masterlist.unit_litre],
  ])('legacy wire %s preselects its localized entry', (wire, label) => {
    renderDialog(makeItem(wire));
    expect(
      screen.getByRole('combobox', { name: en.inventory.master.unit_label }),
    ).toHaveTextContent(label);
    expect(
      screen.queryByLabelText(en.inventory.master.custom_unit_label),
    ).not.toBeInTheDocument();
  });

  it('new wire values (e.g. sets) preselect their entry too', () => {
    renderDialog(makeItem('sets'));
    expect(
      screen.getByRole('combobox', { name: en.inventory.master.unit_label }),
    ).toHaveTextContent(en.inventory.masterlist.unit_sets);
  });

  it('unknown free text opens the custom field with the raw value preserved', () => {
    renderDialog(makeItem('dozen'));
    expect(
      screen.getByRole('combobox', { name: en.inventory.master.unit_label }),
    ).toHaveTextContent(en.inventory.masterlist.unit_custom);
    expect(screen.getByLabelText(en.inventory.master.custom_unit_label)).toHaveValue('dozen');
  });
});
