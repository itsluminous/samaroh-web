/**
 * Files module (shared migration 009) — permission model, permission-matrix
 * row + labels, nav overflow rule (D15: 4 modules + Menu, overflow → Menu →
 * More), SectionGuard on files.view, and the menu-search index entries for
 * overflowed modules.
 */
import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '../messages/en.json';
import hi from '../messages/hi.json';
import AppShell from '@/components/AppShell';
import { NAV_SECTIONS, resolveNavLayout } from '@/components/navSections';
import SectionGuard from '@/components/SectionGuard';
import MenuHome from '@/app/[locale]/(app)/menu/_components/MenuHome';
import PermissionMatrixEditor from '@/app/[locale]/(app)/menu/_components/PermissionMatrixEditor';
import { buildMenuSearchIndex } from '@/lib/menuSearch';
import {
  emptyPermissions,
  matchingPreset,
  normalizePermissions,
  PERMISSION_MATRIX,
  presetPermissions,
} from '@/lib/permissions/permissions';
import {
  BOTTOM_BAR_MODULE_CAP,
  canViewSection,
  firstVisibleSection,
  NAV_MODULES,
  splitNavModules,
  visibleNavModules,
} from '@/lib/permissions/visibility';

const mockUseMembership = jest.fn();
jest.mock('@/lib/permissions/useMembership', () => ({
  useMembership: () => mockUseMembership(),
}));
jest.mock('@/lib/hooks/useSignedIn', () => ({ useSignedIn: () => true }));

jest.mock('next/navigation', () => ({
  usePathname: () => '/en/files',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn(), prefetch: jest.fn(), back: jest.fn(), forward: jest.fn() }),
  useParams: () => ({ locale: 'en' }),
  useSearchParams: () => new URLSearchParams(),
  redirect: jest.fn(),
}));

function membership(overrides: Record<string, unknown> = {}) {
  return {
    supabase: {},
    business: { id: 'b1', name: 'Hall' },
    userId: 'u1',
    isOwner: false,
    permissions: emptyPermissions(),
    loading: false,
    error: null,
    refresh: jest.fn(),
    ...overrides,
  };
}

function wrap(node: React.ReactElement, messages: typeof en = en, locale = 'en') {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

describe('files permission model (009)', () => {
  it('absent files keys normalize to false', () => {
    expect(normalizePermissions({ booking: { view: true } }).files).toEqual({
      view: false,
      upload: false,
      manage_folders: false,
      delete: false,
    });
  });

  it('manage_folders inherits upload when absent — coalesce(manage_folders, upload, false)', () => {
    expect(normalizePermissions({ files: { view: true, upload: true } }).files.manage_folders).toBe(true);
    expect(normalizePermissions({ files: { view: true } }).files.manage_folders).toBe(false);
    expect(normalizePermissions({}).files.manage_folders).toBe(false);
  });

  it('an explicit false never falls through (upload-only member who may not restructure)', () => {
    const p = normalizePermissions({ files: { view: true, upload: true, manage_folders: false } });
    expect(p.files.upload).toBe(true);
    expect(p.files.manage_folders).toBe(false);
  });

  it('explicit true on manage_folders works without upload', () => {
    const p = normalizePermissions({ files: { manage_folders: true } });
    expect(p.files.upload).toBe(false);
    expect(p.files.manage_folders).toBe(true);
  });

  it('non-boolean junk inherits like absent', () => {
    expect(normalizePermissions({ files: { upload: true, manage_folders: 'yes' } }).files.manage_folders).toBe(true);
    expect(normalizePermissions({ files: { manage_folders: 1 } }).files.manage_folders).toBe(false);
  });

  it('presets: Viewer=view, Staff=view+upload(+manage_folders materialized), Manager=all four', () => {
    expect(presetPermissions('viewer').files).toEqual({ view: true, upload: false, manage_folders: false, delete: false });
    expect(presetPermissions('staff').files).toEqual({ view: true, upload: true, manage_folders: true, delete: false });
    expect(presetPermissions('manager').files).toEqual({ view: true, upload: true, manage_folders: true, delete: true });
  });

  it('a staff blob saved WITHOUT the inherited key still round-trips to the staff preset', () => {
    const blob = JSON.parse(JSON.stringify(presetPermissions('staff'))) as Record<string, Record<string, boolean>>;
    delete blob.files!.manage_folders; // what an older client / SQL backfill may write
    expect(matchingPreset(normalizePermissions(blob))).toBe('staff');
  });

  it('PERMISSION_MATRIX has the files row after notes with the four actions', () => {
    const row = PERMISSION_MATRIX.find((r) => r.module === 'files');
    expect(row?.actions).toEqual(['view', 'upload', 'manage_folders', 'delete']);
  });

  it('the matrix editor renders the files group with labels from the files fragment (en + hi)', () => {
    wrap(<PermissionMatrixEditor value={emptyPermissions()} onChange={jest.fn()} />);
    expect(screen.getByText(en.files.permission.group)).toBeInTheDocument();
    for (const action of ['view', 'upload', 'manage_folders', 'delete'] as const) {
      expect(screen.getByLabelText(en.files.permission[`action_${action}`])).toBeInTheDocument();
    }
    wrap(<PermissionMatrixEditor value={emptyPermissions()} onChange={jest.fn()} />, hi, 'hi');
    expect(screen.getByLabelText(hi.files.permission.action_upload)).toBeInTheDocument();
  });

  it('files participates in nav visibility and landing order (after notes)', () => {
    expect(NAV_MODULES).toEqual(['booking', 'expenses', 'inventory', 'notes', 'files']);
    const p = emptyPermissions();
    p.files.view = true;
    expect(canViewSection({ supabase: {}, loading: false, error: null, isOwner: false, permissions: p }, 'files')).toBe(true);
    expect(firstVisibleSection(p, false)).toBe('/files');
  });
});

describe('nav overflow rule (D15: 4 modules + Menu)', () => {
  it('a full-permission owner overflows Files into More', () => {
    const m = { supabase: {}, loading: false, error: null, isOwner: true, permissions: emptyPermissions() };
    const visible = visibleNavModules(m);
    expect(visible).toEqual(['booking', 'expenses', 'inventory', 'notes', 'files']);
    const split = splitNavModules(visible.map((key) => ({ key })));
    expect(split.bar.map((s) => s.key)).toEqual(['booking', 'expenses', 'inventory', 'notes']);
    expect(split.overflow.map((s) => s.key)).toEqual(['files']);
    expect(BOTTOM_BAR_MODULE_CAP).toBe(4);
  });

  it('a member without inventory.view gets Files in the bar and no overflow', () => {
    const p = emptyPermissions();
    p.booking.view = p.expenses.view = p.notes.view = p.files.view = true;
    const layout = resolveNavLayout(membership({ permissions: p }) as never);
    expect(layout.bar.map((s) => s.key)).toEqual(['booking', 'expenses', 'notes', 'files']);
    expect(layout.overflow).toEqual([]);
    expect(layout.rail.map((s) => s.key)).toEqual(['booking', 'expenses', 'notes', 'files']);
  });

  it('NAV_SECTIONS follows module order with the Files entry last', () => {
    expect(NAV_SECTIONS.map((s) => s.key)).toEqual([...NAV_MODULES]);
    expect(NAV_SECTIONS.at(-1)?.labelKey).toBe('files.nav.tab');
  });

  it('AppShell: owner sees Files in the desktop rail but NOT in the bottom bar; Menu is last in both', () => {
    mockUseMembership.mockReturnValue(membership({ isOwner: true }));
    wrap(<AppShell>{null}</AppShell>);
    const navs = screen.getAllByRole('navigation');
    // Rail (List component="nav") lists every module incl. Files.
    const rail = navs[0]!;
    expect(within(rail).getByText(en.files.nav.tab)).toBeInTheDocument();
    // Bottom bar: 4 modules + Menu, no Files.
    const barLinks = document.querySelectorAll('.MuiBottomNavigationAction-root');
    const barLabels = Array.from(barLinks).map((el) => el.textContent);
    expect(barLabels).toEqual([en.common.nav.booking, en.common.nav.expenses, en.common.nav.inventory, en.notes.nav.tab, en.common.nav.menu]);
  });

  it('AppShell: a member with only files.view sees Files in the bottom bar', () => {
    const p = emptyPermissions();
    p.files.view = true;
    mockUseMembership.mockReturnValue(membership({ permissions: p }));
    wrap(<AppShell>{null}</AppShell>);
    const barLabels = Array.from(document.querySelectorAll('.MuiBottomNavigationAction-root')).map((el) => el.textContent);
    expect(barLabels).toEqual([en.files.nav.tab, en.common.nav.menu]);
  });

  it('AppShell: no Files entry anywhere without files.view', () => {
    const p = emptyPermissions();
    p.booking.view = true;
    mockUseMembership.mockReturnValue(membership({ permissions: p }));
    wrap(<AppShell>{null}</AppShell>);
    expect(screen.queryAllByText(en.files.nav.tab)).toHaveLength(0);
  });

  it('MenuHome shows the More section with the overflowed module only when something overflowed', () => {
    mockUseMembership.mockReturnValue(membership({ isOwner: true }));
    wrap(<MenuHome title={en.menu.home.title} />);
    expect(screen.getByText(en.files.nav.more_section)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: new RegExp(en.files.nav.tab) })).toHaveAttribute('href', '/en/files');

    const p = emptyPermissions();
    p.files.view = true;
    mockUseMembership.mockReturnValue(membership({ permissions: p }));
    wrap(<MenuHome title={en.menu.home.title} />, hi, 'hi');
    expect(screen.queryByText(hi.files.nav.more_section)).not.toBeInTheDocument();
  });

  it('menu search indexes overflowed modules under the More section (same gate as the rows)', () => {
    const t = (key: string) => key;
    const withOverflow = buildMenuSearchIndex(
      { isOwner: true, permissions: emptyPermissions(), signedIn: true, overflowModules: ['files'] },
      t,
    );
    const entry = withOverflow.find((e) => e.id === 'module_files');
    expect(entry).toMatchObject({ label: 'files.nav.tab', section: 'files.nav.more_section', href: '/files' });
    expect(withOverflow.find((e) => e.id === 'module_notes')).toBeUndefined();

    const noOverflow = buildMenuSearchIndex({ isOwner: true, permissions: emptyPermissions(), signedIn: true }, t);
    expect(noOverflow.find((e) => e.id.startsWith('module_'))).toBeUndefined();
  });
});

describe('files route guard', () => {
  it('renders children with files.view and the no-access state without it', () => {
    const p = emptyPermissions();
    p.files.view = true;
    mockUseMembership.mockReturnValue(membership({ permissions: p }));
    wrap(
      <SectionGuard module="files">
        <div>{'files-content'}</div>
      </SectionGuard>,
    );
    expect(screen.getByText('files-content')).toBeInTheDocument();

    mockUseMembership.mockReturnValue(membership());
    wrap(
      <SectionGuard module="files">
        <div>{'files-content-2'}</div>
      </SectionGuard>,
    );
    expect(screen.queryByText('files-content-2')).not.toBeInTheDocument();
    expect(screen.getByText(en.common.permission.no_access_title)).toBeInTheDocument();
  });
});
