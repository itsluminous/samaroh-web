/**
 * Renders the app shell in both v1 locales and asserts the chrome (app name,
 * section nav labels, title-bar kebab) is fully localized from the generated
 * catalog, that the title bar carries NO sign-out icon (owner feedback
 * 2026-09-29: sign-out lives on the Menu identity row only) and that Menu is
 * the last rail entry + the title-bar kebab rather than a bottom-bar tab.
 */
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import en from '../messages/en.json';
import hi from '../messages/hi.json';
import AppShell from '@/components/AppShell';
import { emptyPermissions, type MemberPermissions } from '@/lib/permissions/permissions';

// Membership drives nav visibility; the default (fail-open: no Supabase)
// keeps the localization tests exercising all 4 sections.
const mockUseMembership = jest.fn();
jest.mock('@/lib/permissions/useMembership', () => ({
  useMembership: () => mockUseMembership(),
}));

function membership(overrides: Record<string, unknown> = {}) {
  return {
    supabase: null,
    business: null,
    userId: null,
    isOwner: false,
    permissions: emptyPermissions(),
    loading: false,
    error: null,
    refresh: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  mockUseMembership.mockReturnValue(membership());
});

jest.mock('next/navigation', () => ({
  usePathname: () => '/en/booking',
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

type Messages = typeof en;

/** The title-bar kebab (⋮): the only link carrying the MoreVert icon (the rail's Menu row uses the hamburger icon). */
function kebabLink(): HTMLAnchorElement {
  const link = document.querySelector('[data-testid="MoreVertIcon"]')?.closest('a');
  if (!link) {
    throw new Error('kebab link not rendered');
  }
  return link;
}

function renderShell(locale: string, messages: Messages, children: ReactNode = null) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <AppShell>{children}</AppShell>
    </NextIntlClientProvider>,
  );
}

describe('AppShell', () => {
  it.each([
    {
      locale: 'en',
      messages: en,
      appName: en.common.app_name,
      navLabels: Object.values(en.common.nav),
    },
    {
      locale: 'hi',
      messages: hi as Messages,
      appName: hi.common.app_name,
      navLabels: Object.values(hi.common.nav),
    },
  ])('renders the localized chrome in $locale', ({ locale, messages, appName, navLabels }) => {
    renderShell(locale, messages);

    expect(screen.getByRole('heading', { name: appName })).toBeInTheDocument();
    expect(navLabels).toHaveLength(4);
    const menuLabel = (messages as Messages).common.nav.menu;
    for (const label of navLabels) {
      // Each MODULE label appears in the desktop rail and the mobile bottom
      // nav; Menu is rail-only (its mobile entry is the title-bar kebab).
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(label === menuLabel ? 1 : 2);
    }
    // The kebab is a localized link to the Menu route.
    expect(kebabLink()).toHaveAttribute('href', `/${locale}/menu`);
  });

  it('has no sign-out icon in the title bar (sign-out lives on the Menu identity row)', () => {
    renderShell('en', en);
    expect(screen.queryByLabelText(en.auth.action.sign_out)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(en.menu.identity.sign_out)).not.toBeInTheDocument();
    expect(document.querySelector('form[action="/auth/sign-out"]')).toBeNull();
    expect(document.querySelector('[data-testid="LogoutIcon"]')).toBeNull();
  });

  it('Menu is not a bottom-bar tab; the title-bar kebab opens the Menu route', () => {
    renderShell('en', en);
    const barLabels = Array.from(document.querySelectorAll('.MuiBottomNavigationAction-root')).map((el) => el.textContent);
    expect(barLabels).not.toContain(en.common.nav.menu);
    const kebab = kebabLink();
    expect(kebab).toHaveAttribute('href', '/en/menu');
    expect(kebab).toHaveAccessibleName(en.common.nav.menu);
    // Rail: Menu is the last entry.
    const rail = screen.getAllByRole('navigation')[0]!;
    const railLabels = Array.from(rail.querySelectorAll('.MuiListItemText-primary')).map((el) => el.textContent);
    expect(railLabels.at(-1)).toBe(en.common.nav.menu);
  });

  it('renders its children in the main region', () => {
    const probe = 'main-region-probe';
    renderShell('en', en, <span>{probe}</span>);
    expect(screen.getByRole('main')).toHaveTextContent(probe);
  });

  it('lets the main region shrink below its content min-width', () => {
    // <main> is a flex item; without min-width:0 any wide child (long chip
    // rows) inflates it and the whole page pans sideways on narrow phones.
    renderShell('en', en);
    expect(screen.getByRole('main')).toHaveStyle({ minWidth: 0 });
  });

  it('has no language switcher in the top bar (Settings owns language)', () => {
    // The full picker lives at Menu → Settings → Language (menu-searchable);
    // the freed toolbar width goes to the business-name title.
    renderShell('en', en);
    expect(screen.queryByLabelText(en.common.language.switcher_label)).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});

describe('AppShell nav visibility (§3)', () => {
  const navLabel = (key: keyof typeof en.common.nav) => en.common.nav[key];

  /** Rail + bottom nav both render a module label; 0 hits = hidden everywhere. */
  const countNav = (key: keyof typeof en.common.nav) => screen.queryAllByText(navLabel(key)).length;
  /** Menu: rail text + title-bar kebab link (never a bottom-bar tab). */
  const menuReachable = () =>
    countNav('menu') >= 1 && kebabLink().getAttribute('href') === '/en/menu';

  function renderWith(permissions: MemberPermissions, overrides: Record<string, unknown> = {}) {
    mockUseMembership.mockReturnValue(
      membership({ supabase: {}, business: { id: 'b1' }, userId: 'u1', permissions, ...overrides }),
    );
    renderShell('en', en);
  }

  it.each([
    { name: 'booking only', view: ['booking'], hidden: ['expenses', 'inventory'] },
    { name: 'expenses only', view: ['expenses'], hidden: ['booking', 'inventory'] },
    { name: 'inventory only', view: ['inventory'], hidden: ['booking', 'expenses'] },
    { name: 'none', view: [], hidden: ['booking', 'expenses', 'inventory'] },
  ])('maps view permissions to both navs: $name', ({ view, hidden }) => {
    const perms = emptyPermissions();
    for (const mod of view) {
      (perms[mod as 'booking' | 'expenses' | 'inventory'] as { view: boolean }).view = true;
    }
    renderWith(perms);
    for (const key of view) {
      expect(countNav(key as never)).toBeGreaterThanOrEqual(2);
    }
    for (const key of hidden) {
      expect(countNav(key as never)).toBe(0);
    }
    // Menu never disappears (rail entry + kebab).
    expect(menuReachable()).toBe(true);
    if (view.length === 0) {
      // No viewable module → no bottom bar at all (Menu is the kebab).
      expect(document.querySelector('.MuiBottomNavigation-root')).toBeNull();
    }
  });

  it('shows every section to the owner', () => {
    renderWith(emptyPermissions(), { isOwner: true });
    for (const key of ['booking', 'expenses', 'inventory'] as const) {
      expect(countNav(key)).toBeGreaterThanOrEqual(2);
    }
    expect(menuReachable()).toBe(true);
  });

  it('fails open while membership is loading', () => {
    renderWith(emptyPermissions(), { loading: true });
    for (const key of ['booking', 'expenses', 'inventory'] as const) {
      expect(countNav(key)).toBeGreaterThanOrEqual(2);
    }
    expect(menuReachable()).toBe(true);
  });
});
