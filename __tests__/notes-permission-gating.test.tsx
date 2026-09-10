/**
 * Notes permission gating: the notes module in the permissions model
 * (absent = false, presets per the schema guidance), the PERMISSION_MATRIX
 * row the editor renders (labels from the notes fragment), nav visibility of
 * the 5th tab, and the SectionGuard route gate on notes.view.
 */
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '../messages/en.json';
import hi from '../messages/hi.json';
import AppShell from '@/components/AppShell';
import SectionGuard from '@/components/SectionGuard';
import PermissionMatrixEditor from '@/app/[locale]/(app)/menu/_components/PermissionMatrixEditor';
import {
  emptyPermissions,
  normalizePermissions,
  PERMISSION_MATRIX,
  presetPermissions,
} from '@/lib/permissions/permissions';
import { canViewSection, firstVisibleSection, NAV_MODULES } from '@/lib/permissions/visibility';

const mockUseMembership = jest.fn();
jest.mock('@/lib/permissions/useMembership', () => ({
  useMembership: () => mockUseMembership(),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/en/notes',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
  }),
  useParams: () => ({ locale: 'en' }),
  useSearchParams: () => new URLSearchParams(),
  redirect: jest.fn(),
}));

function membership(overrides: Record<string, unknown> = {}) {
  return {
    supabase: {},
    business: { id: 'b1' },
    userId: 'u1',
    isOwner: false,
    permissions: emptyPermissions(),
    loading: false,
    error: null,
    refresh: jest.fn(),
    ...overrides,
  };
}

describe('notes permission model', () => {
  it('absent notes keys normalize to false (no view_amounts exception)', () => {
    const perms = normalizePermissions({ booking: { view: true } });
    expect(perms.notes).toEqual({ view: false, create: false, edit: false, delete: false });
  });

  it('explicit grants survive normalization', () => {
    const perms = normalizePermissions({ notes: { view: true, edit: true } });
    expect(perms.notes.view).toBe(true);
    expect(perms.notes.edit).toBe(true);
    expect(perms.notes.create).toBe(false);
    expect(perms.notes.delete).toBe(false);
  });

  it('presets follow the schema guidance: Viewer=view, Staff=+create, Manager=all', () => {
    expect(presetPermissions('viewer').notes).toEqual({ view: true, create: false, edit: false, delete: false });
    expect(presetPermissions('staff').notes).toEqual({ view: true, create: true, edit: false, delete: false });
    expect(presetPermissions('manager').notes).toEqual({ view: true, create: true, edit: true, delete: true });
  });

  it('PERMISSION_MATRIX gains the notes row between inventory and reports', () => {
    const modules = PERMISSION_MATRIX.map((row) => row.module);
    expect(modules.indexOf('notes')).toBe(modules.indexOf('inventory') + 1);
    expect(modules.indexOf('reports')).toBe(modules.indexOf('notes') + 1);
    const row = PERMISSION_MATRIX.find((r) => r.module === 'notes');
    expect(row?.actions).toEqual(['view', 'create', 'edit', 'delete']);
  });

  it('notes participates in nav visibility and landing order (after inventory)', () => {
    expect(NAV_MODULES).toEqual(['booking', 'expenses', 'inventory', 'notes']);
    const p = emptyPermissions();
    p.notes.view = true;
    expect(canViewSection({ supabase: {}, loading: false, error: null, isOwner: false, permissions: p }, 'notes')).toBe(true);
    expect(firstVisibleSection(p, false)).toBe('/notes');
    expect(firstVisibleSection(emptyPermissions(), false)).toBe('/menu');
  });
});

describe('notes nav entry (rail + bottom nav)', () => {
  function renderShell(messages: typeof en = en, locale = 'en') {
    return render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <AppShell>{null}</AppShell>
      </NextIntlClientProvider>,
    );
  }

  it('shows the localized Notes tab in both navs for a member with notes.view', () => {
    const perms = emptyPermissions();
    perms.notes.view = true;
    mockUseMembership.mockReturnValue(membership({ permissions: perms }));
    renderShell();
    expect(screen.getAllByText(en.notes.nav.tab).length).toBeGreaterThanOrEqual(2);
  });

  it('hides the Notes tab entirely without notes.view (other tabs unaffected)', () => {
    const perms = emptyPermissions();
    perms.booking.view = true;
    mockUseMembership.mockReturnValue(membership({ permissions: perms }));
    renderShell();
    expect(screen.queryAllByText(en.notes.nav.tab)).toHaveLength(0);
    expect(screen.getAllByText(en.common.nav.booking).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(en.common.nav.menu).length).toBeGreaterThanOrEqual(2);
  });

  it('shows the Notes tab to the owner, localized in Hindi too', () => {
    mockUseMembership.mockReturnValue(membership({ isOwner: true }));
    renderShell(hi as typeof en, 'hi');
    expect(screen.getAllByText(hi.notes.nav.tab).length).toBeGreaterThanOrEqual(2);
  });
});

describe('SectionGuard module="notes"', () => {
  function renderGuard() {
    return render(
      <NextIntlClientProvider locale="en" messages={en}>
        <SectionGuard module="notes">
          <div data-testid="notes-content" />
        </SectionGuard>
      </NextIntlClientProvider>,
    );
  }

  it('shows the no-access state without notes.view', () => {
    mockUseMembership.mockReturnValue(membership());
    renderGuard();
    expect(screen.queryByTestId('notes-content')).not.toBeInTheDocument();
    expect(screen.getByText(en.common.permission.no_access_title)).toBeInTheDocument();
  });

  it('renders the section with notes.view (and always for owners)', () => {
    const perms = emptyPermissions();
    perms.notes.view = true;
    mockUseMembership.mockReturnValue(membership({ permissions: perms }));
    const { unmount } = renderGuard();
    expect(screen.getByTestId('notes-content')).toBeInTheDocument();
    unmount();

    mockUseMembership.mockReturnValue(membership({ isOwner: true }));
    renderGuard();
    expect(screen.getByTestId('notes-content')).toBeInTheDocument();
  });
});

describe('PermissionMatrixEditor — notes group', () => {
  it('renders the notes group with labels from the notes fragment', () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <PermissionMatrixEditor value={emptyPermissions()} onChange={() => {}} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(en.notes.permission.group)).toBeInTheDocument();
    // "Delete forever" is unique to the notes group's action labels.
    expect(screen.getByLabelText(en.notes.permission.action_delete)).toBeInTheDocument();
  });
});
