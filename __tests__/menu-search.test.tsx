/**
 * Menu search (§4.4 parity): a search bar on the Menu tab filters a static
 * localized index of every nested destination. Covered here:
 *   1. Index ↔ rendered-menu coverage — every index entry corresponds to a
 *      row actually rendered by MenuHome / SettingsScreen / ReportsHome /
 *      About, and every destination row is indexed (no unreachable or
 *      missing entries).
 *   2. Permission gating parity — entries the member cannot reach (owner-only
 *      Members, the manage_business event-types page, reports without view /
 *      money reports
 *      without view_amounts, sign-out without a session) never appear.
 *   3. Live filtering — substring, fuzzy typo tolerance, empty query.
 *   4. Navigation — clicking a result links to the nested page (with the
 *      ?hl= anchor for rows that live on a parent page).
 *   5. Hindi labels — the index and filter operate on hi catalog values.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { NextIntlClientProvider } from 'next-intl';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import theme from '@/theme/theme';
import en from '../messages/en.json';
import hi from '../messages/hi.json';
import AboutPage from '@/app/[locale]/(app)/menu/about/page';
import MenuHome from '@/app/[locale]/(app)/menu/_components/MenuHome';
import ReportsHome from '@/app/[locale]/(app)/menu/_components/ReportsHome';
import SettingsScreen from '@/app/[locale]/(app)/menu/_components/SettingsScreen';
import {
  buildMenuSearchIndex,
  filterMenuSearchEntries,
  type MenuSearchGates,
} from '@/lib/menuSearch';
import { emptyPermissions, type MemberPermissions } from '@/lib/permissions/permissions';
import { isMoneyReport, REPORT_KEYS } from '@/lib/reports/types';

const mockUseMembership = jest.fn();
jest.mock('@/lib/permissions/useMembership', () => ({
  useMembership: () => mockUseMembership(),
}));

const mockUseSignedIn = jest.fn(() => true);
jest.mock('@/lib/hooks/useSignedIn', () => ({
  useSignedIn: () => mockUseSignedIn(),
}));

// MenuIdentityRow / SettingsScreen reach for these internally.
jest.mock('@/lib/guest/guest', () => ({
  isGuestMode: jest.fn(() => false),
}));
jest.mock('@/lib/outbox/useOutbox', () => ({
  useOutbox: () => ({ pendingCount: 0, syncing: false }),
}));
jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(() => null),
  createRemoteClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn(async () => ({ data: { user: { email: 'owner@example.com' } }, error: null })),
      getSession: jest.fn(async () => ({ data: { session: { user: { id: 'u1' } } } })),
    },
  })),
}));

// Locale-aware Link/router double: renders a plain anchor so href assertions
// see the app-relative route the result navigates to.
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

/** Root-namespace translator over a generated messages object (dot path). */
function makeT(messages: Messages) {
  return (key: string): string => {
    const value = key
      .split('.')
      .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part as never], messages);
    if (typeof value !== 'string') {
      throw new Error(`missing message for ${key}`);
    }
    return value;
  };
}

const tEn = makeT(en);
const tHi = makeT(hi as Messages);

function gates(overrides: Partial<MenuSearchGates> = {}): MenuSearchGates {
  return { isOwner: true, permissions: emptyPermissions(), signedIn: true, ...overrides };
}

function membership(permissions: MemberPermissions = emptyPermissions(), isOwner = true) {
  return {
    supabase: {
      storage: {
        from: () => ({ download: async () => ({ data: null, error: { message: 'unavailable' } }) }),
      },
    },
    business: {
      id: 'b1',
      name: 'Sharma Palace',
      business_type: 'Banquet hall',
      address: null,
      owner_name: 'Ramesh Sharma',
      logo_path: null,
      invoice_prefix: 'SP',
      owner_user_id: 'u1',
    },
    userId: 'u1',
    isOwner,
    permissions,
    loading: false,
    error: null,
    refresh: jest.fn(),
  };
}

function withProviders(ui: React.ReactElement, locale = 'en', messages: Messages = en) {
  return render(
    <ThemeProvider theme={theme}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        {ui}
      </NextIntlClientProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseMembership.mockReturnValue(membership());
  mockUseSignedIn.mockReturnValue(true);
});

describe('index coverage vs the rendered menu (owner, signed in)', () => {
  it('every index entry corresponds to a rendered destination, and every destination is indexed', async () => {
    const index = buildMenuSearchIndex(gates(), tEn);
    const labels = new Set(index.map((entry) => entry.label));

    // Render the whole menu tree the way an owner sees it.
    const home = withProviders(<MenuHome title={en.menu.home.title} />);
    // Sign-out affordance resolves async from the session; it renders as an
    // icon button, so its accessible name counts as its rendered label.
    await screen.findByLabelText(en.menu.identity.sign_out);
    const ariaLabels = Array.from(home.container.querySelectorAll('[aria-label]'))
      .map((el) => el.getAttribute('aria-label'))
      .join('\n');
    const homeText = (home.container.textContent ?? '') + ariaLabels;
    home.unmount();

    const settings = withProviders(<SettingsScreen />);
    const settingsText = settings.container.textContent ?? '';
    settings.unmount();

    const reports = withProviders(<ReportsHome />);
    const reportsText = reports.container.textContent ?? '';
    reports.unmount();

    const about = withProviders(<AboutPage />);
    const aboutText = about.container.textContent ?? '';
    about.unmount();

    const renderedText = homeText + settingsText + reportsText + aboutText;

    // 1) No unreachable entries: each indexed label is really rendered.
    for (const entry of index) {
      expect(renderedText).toContain(entry.label);
    }

    // 2) Coverage: every destination surfaced by the menu screens is indexed.
    const expected = [
      en.menu.section.settings,
      en.menu.section.reports,
      en.menu.section.members,
      en.menu.section.about,
      en.menu.identity.sign_out,
      en.settings.language.title,
      en.settings.theme.title,
      en.settings.event_types.title,
      en.settings.sync.title,
      en.settings.google.title,
      en.settings.booking_form.title,
      en.settings.business.title,
      en.menu.about.source_code,
      en.menu.about.licenses,
      ...REPORT_KEYS.map((key) => en.reports.report[key]),
    ];
    for (const label of expected) {
      expect(labels).toContain(label);
    }
    // Exactly these — nothing else can leak into search.
    expect(index).toHaveLength(expected.length);
  });
});

describe('permission gating parity', () => {
  it('hides owner-only and manage_business destinations from a plain member', () => {
    const index = buildMenuSearchIndex(gates({ isOwner: false }), tEn);
    const labels = index.map((entry) => entry.label);

    expect(labels).not.toContain(en.menu.section.members);
    expect(labels).not.toContain(en.settings.event_types.title);
    // Business profile stays findable: non-editors get the read-only card.
    expect(labels).toContain(en.settings.business.title);
    // reports.view is false → not a single report name leaks.
    for (const key of REPORT_KEYS) {
      expect(labels).not.toContain(en.reports.report[key]);
    }
    // Ungated rows stay.
    expect(labels).toContain(en.settings.language.title);
    expect(labels).toContain(en.settings.sync.title);
  });

  it('mirrors ReportsHome: view_amounts=false keeps only the amount-free reports', () => {
    const permissions = emptyPermissions();
    permissions.reports.view = true;
    permissions.reports.view_amounts = false;
    const index = buildMenuSearchIndex(gates({ isOwner: false, permissions }), tEn);
    const labels = index.map((entry) => entry.label);

    for (const key of REPORT_KEYS) {
      if (isMoneyReport(key)) {
        expect(labels).not.toContain(en.reports.report[key]);
      } else {
        expect(labels).toContain(en.reports.report[key]);
      }
    }
  });

  it('offers sign-out only with a real session', () => {
    const signedOut = buildMenuSearchIndex(gates({ signedIn: false }), tEn);
    expect(signedOut.map((entry) => entry.id)).not.toContain('sign_out');

    const signedIn = buildMenuSearchIndex(gates(), tEn);
    expect(signedIn.map((entry) => entry.id)).toContain('sign_out');
  });

  it('grants owners everything regardless of the permissions object', () => {
    const index = buildMenuSearchIndex(gates({ isOwner: true }), tEn);
    const labels = index.map((entry) => entry.label);
    expect(labels).toContain(en.menu.section.members);
    for (const key of REPORT_KEYS) {
      expect(labels).toContain(en.reports.report[key]);
    }
  });
});

describe('live filtering', () => {
  const index = buildMenuSearchIndex(gates(), tEn);

  it('returns nothing for an empty or whitespace query (normal menu shows)', () => {
    expect(filterMenuSearchEntries('', index)).toHaveLength(0);
    expect(filterMenuSearchEntries('   ', index)).toHaveLength(0);
  });

  it('matches case-insensitive substrings, prefix hits first', () => {
    const results = filterMenuSearchEntries('lang', index);
    expect(results[0]?.label).toBe(en.settings.language.title);
  });

  it('matches keyword strings (theme mode names)', () => {
    const results = filterMenuSearchEntries(en.settings.theme.dark.toLowerCase(), index);
    expect(results.map((entry) => entry.id)).toContain('theme');
  });

  it('tolerates typos via the shared fuzzy matcher', () => {
    const results = filterMenuSearchEntries('langauge', index);
    expect(results.map((entry) => entry.id)).toContain('language');
  });

  it('returns an empty list for garbage queries', () => {
    expect(filterMenuSearchEntries('zzqqxx99', index)).toHaveLength(0);
  });
});

describe('search UI in MenuHome', () => {
  it('shows the normal menu when the query is empty and results when typing', async () => {
    withProviders(<MenuHome title={en.menu.home.title} />);
    // Normal menu visible.
    expect(screen.getByText(en.menu.section.settings)).toBeInTheDocument();

    const input = screen.getByLabelText(en.menu.search.placeholder);
    fireEvent.change(input, { target: { value: en.settings.sync.title } });

    // Result links straight to the nested page.
    const result = screen.getByText(en.settings.sync.title).closest('a');
    expect(result).toHaveAttribute('href', '/menu/settings/sync');
    // Normal section list is replaced while searching.
    expect(screen.queryByText(en.menu.section.settings_subtitle)).not.toBeInTheDocument();

    // Clearing restores the menu.
    fireEvent.click(screen.getByLabelText(en.menu.search.clear));
    expect(screen.getByText(en.menu.section.settings_subtitle)).toBeInTheDocument();
  });

  it('links row-level results to the parent page with a highlight anchor', () => {
    withProviders(<MenuHome title={en.menu.home.title} />);
    const input = screen.getByLabelText(en.menu.search.placeholder);
    fireEvent.change(input, { target: { value: en.settings.theme.title } });

    const result = screen.getByText(en.settings.theme.title).closest('a');
    expect(result).toHaveAttribute('href', '/menu/settings?hl=theme');
  });

  it('links report results to their report page', () => {
    withProviders(<MenuHome title={en.menu.home.title} />);
    const input = screen.getByLabelText(en.menu.search.placeholder);
    fireEvent.change(input, { target: { value: en.reports.report.occupancy } });

    const result = screen.getByText(en.reports.report.occupancy).closest('a');
    expect(result).toHaveAttribute('href', '/menu/reports/occupancy');
  });

  it('shows the localized empty state for a miss', () => {
    withProviders(<MenuHome title={en.menu.home.title} />);
    const input = screen.getByLabelText(en.menu.search.placeholder);
    fireEvent.change(input, { target: { value: 'zzqqxx99' } });
    expect(screen.getByText(en.menu.search.no_results)).toBeInTheDocument();
  });

  it('never lists gated destinations for a plain member', () => {
    mockUseMembership.mockReturnValue(membership(emptyPermissions(), false));
    withProviders(<MenuHome title={en.menu.home.title} />);
    const input = screen.getByLabelText(en.menu.search.placeholder);
    fireEvent.change(input, { target: { value: en.menu.section.members } });
    expect(screen.getByText(en.menu.search.no_results)).toBeInTheDocument();
  });
});

describe('hindi locale', () => {
  it('indexes and filters on hi catalog labels', () => {
    const index = buildMenuSearchIndex(gates(), tHi);
    const labels = index.map((entry) => entry.label);
    expect(labels).toContain((hi as Messages).settings.language.title);

    const results = filterMenuSearchEntries((hi as Messages).settings.language.title, index);
    expect(results[0]?.label).toBe((hi as Messages).settings.language.title);
  });

  it('renders hi results in the MenuHome search UI', () => {
    const hiMessages = hi as Messages;
    withProviders(<MenuHome title={hiMessages.menu.home.title} />, 'hi', hiMessages);
    const input = screen.getByLabelText(hiMessages.menu.search.placeholder);
    fireEvent.change(input, { target: { value: hiMessages.settings.sync.title } });

    const result = screen.getByText(hiMessages.settings.sync.title).closest('a');
    expect(result).toHaveAttribute('href', '/menu/settings/sync');
    expect(within(result as HTMLElement).getByText(hiMessages.menu.section.settings)).toBeInTheDocument();
  });
});
