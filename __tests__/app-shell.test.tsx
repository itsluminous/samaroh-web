/**
 * Renders the app shell in both v1 locales and asserts the chrome (app name,
 * 4 section nav labels) is fully localized from the generated catalog.
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
    for (const label of navLabels) {
      // Each section label appears in the desktop rail and the mobile bottom nav.
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('renders its children in the main region', () => {
    const probe = en.app.placeholder.title;
    renderShell('en', en, <span>{probe}</span>);
    expect(screen.getByRole('main')).toHaveTextContent(probe);
  });

  it('lets the main region shrink below its content min-width', () => {
    // <main> is a flex item; without min-width:0 any wide child (long chip
    // rows) inflates it and the whole page pans sideways on narrow phones.
    renderShell('en', en);
    expect(screen.getByRole('main')).toHaveStyle({ minWidth: 0 });
  });
});

describe('AppShell nav visibility (§3)', () => {
  const navLabel = (key: keyof typeof en.common.nav) => en.common.nav[key];

  /** Rail + bottom nav both render the label; 0 hits = hidden everywhere. */
  const countNav = (key: keyof typeof en.common.nav) => screen.queryAllByText(navLabel(key)).length;

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
    // Menu never disappears.
    expect(countNav('menu')).toBeGreaterThanOrEqual(2);
  });

  it('shows every section to the owner', () => {
    renderWith(emptyPermissions(), { isOwner: true });
    for (const key of ['booking', 'expenses', 'inventory', 'menu'] as const) {
      expect(countNav(key)).toBeGreaterThanOrEqual(2);
    }
  });

  it('fails open while membership is loading', () => {
    renderWith(emptyPermissions(), { loading: true });
    for (const key of ['booking', 'expenses', 'inventory', 'menu'] as const) {
      expect(countNav(key)).toBeGreaterThanOrEqual(2);
    }
  });
});
