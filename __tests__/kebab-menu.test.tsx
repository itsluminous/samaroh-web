/**
 * Title-bar kebab → Menu (owner feedback 2026-09-29). On mobile the Menu tab
 * left the bottom bar; the ⋮ icon to the right of the sync indicator links to
 * the EXISTING Menu route (Android parity: kebab → Menu screen), which keeps
 * its search field and lists the same permission-gated rows as before —
 * Settings, Reports, Members (owner only), About, plus the identity row with
 * sign-out (signed in) or Sign in (guest / no session).
 */
import { render, screen, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { NextIntlClientProvider } from 'next-intl';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import theme from '@/theme/theme';
import en from '../messages/en.json';
import hi from '../messages/hi.json';
import MenuHome from '@/app/[locale]/(app)/menu/_components/MenuHome';
import AppShell from '@/components/AppShell';
import { isGuestMode } from '@/lib/guest/guest';
import { emptyPermissions } from '@/lib/permissions/permissions';

const mockUseMembership = jest.fn();
jest.mock('@/lib/permissions/useMembership', () => ({
  useMembership: () => mockUseMembership(),
}));

const mockUseSignedIn = jest.fn(() => true);
jest.mock('@/lib/hooks/useSignedIn', () => ({
  useSignedIn: () => mockUseSignedIn(),
}));

jest.mock('@/lib/guest/guest', () => ({
  isGuestMode: jest.fn(() => false),
}));
const mockIsGuestMode = isGuestMode as jest.Mock;

jest.mock('@/lib/outbox/useOutbox', () => ({
  useOutbox: () => ({ pendingCount: 0, syncing: false }),
}));

const mockGetUser = jest.fn(async () => ({ data: { user: { email: 'owner@example.com' } }, error: null }));
jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(() => null),
  createRemoteClient: jest.fn(() => ({
    auth: {
      getUser: () => mockGetUser(),
      getSession: jest.fn(async () => ({ data: { session: { user: { id: 'u1' } } } })),
    },
  })),
}));

jest.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children?: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/menu',
}));

type Messages = typeof en;

function membership(overrides: Record<string, unknown> = {}) {
  return {
    supabase: {},
    business: { id: 'b1', name: 'Sharma Palace', owner_user_id: 'u1', owner_name: 'Ramesh' },
    userId: 'u1',
    isOwner: true,
    permissions: emptyPermissions(),
    loading: false,
    error: null,
    refresh: jest.fn(),
    ...overrides,
  };
}

function renderMenuViaShell(locale = 'en', messages: Messages = en) {
  return render(
    <ThemeProvider theme={theme}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <AppShell>
          <MenuHome title={messages.menu.home.title} />
        </AppShell>
      </NextIntlClientProvider>
    </ThemeProvider>,
  );
}

function kebab(): HTMLAnchorElement {
  const link = document.querySelector('[data-testid="MoreVertIcon"]')?.closest('a');
  if (!link) {
    throw new Error('kebab not rendered');
  }
  return link;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseMembership.mockReturnValue(membership());
  mockUseSignedIn.mockReturnValue(true);
  mockIsGuestMode.mockReturnValue(false);
  mockGetUser.mockResolvedValue({ data: { user: { email: 'owner@example.com' } }, error: null });
});

describe('title-bar kebab → Menu', () => {
  it('sits right of the sync indicator, links to /menu and is marked current on the Menu route', () => {
    renderMenuViaShell();
    const link = kebab();
    expect(link).toHaveAttribute('href', '/menu');
    expect(link).toHaveAccessibleName(en.common.nav.menu);
    expect(link).toHaveAttribute('aria-current', 'page');
    // Order inside the toolbar: title, sync indicator, kebab (last).
    const toolbar = link.closest('.MuiToolbar-root')!;
    expect(toolbar.lastElementChild).toBe(link);
    // No sign-out anywhere in the title bar.
    expect(within(toolbar as HTMLElement).queryByLabelText(en.auth.action.sign_out)).not.toBeInTheDocument();
  });

  it('owner, signed in: the Menu page keeps search + Settings/Reports/Members/About + sign-out on the identity row', async () => {
    renderMenuViaShell();
    const main = screen.getByRole('main');
    expect(within(main).getByLabelText(en.menu.search.placeholder)).toBeInTheDocument();
    for (const key of ['settings', 'reports', 'members', 'about'] as const) {
      expect(within(main).getByText(en.menu.section[key])).toBeInTheDocument();
    }
    expect(await within(main).findByLabelText(en.menu.identity.sign_out)).toBeInTheDocument();
    expect(within(main).queryByRole('link', { name: en.menu.identity.sign_in })).not.toBeInTheDocument();
  });

  it('member (non-owner): Members is hidden, not greyed', () => {
    mockUseMembership.mockReturnValue(membership({ isOwner: false }));
    renderMenuViaShell();
    const main = screen.getByRole('main');
    expect(within(main).queryByText(en.menu.section.members)).not.toBeInTheDocument();
    expect(within(main).getByText(en.menu.section.settings)).toBeInTheDocument();
    expect(main.querySelectorAll('.Mui-disabled')).toHaveLength(0);
  });

  it('guest mode: same kebab, guest-appropriate items — Sign in instead of sign-out, no Members', async () => {
    mockIsGuestMode.mockReturnValue(true);
    mockUseSignedIn.mockReturnValue(false);
    mockUseMembership.mockReturnValue(membership({ isOwner: true })); // guest owns the local business
    renderMenuViaShell('hi', hi as Messages);
    expect(kebab()).toHaveAccessibleName(hi.common.nav.menu);
    const main = screen.getByRole('main');
    expect(await within(main).findByText(hi.menu.identity.not_signed_in)).toBeInTheDocument();
    expect(within(main).getByRole('link', { name: hi.menu.identity.sign_in })).toHaveAttribute('href', '/sign-in');
    expect(within(main).queryByLabelText(hi.menu.identity.sign_out)).not.toBeInTheDocument();
    expect(within(main).getByLabelText(hi.menu.search.placeholder)).toBeInTheDocument();
    for (const key of ['settings', 'reports', 'about'] as const) {
      expect(within(main).getByText(hi.menu.section[key])).toBeInTheDocument();
    }
  });
});
