/**
 * Menu → Help page (Android parity) rendered through the real catalogs:
 *   1. en + hi — title (shared `common.menu.help`), screen titles, task titles
 *      and numbered steps come out in the UI language; nothing hardcoded.
 *   2. "Show me" per task links to the task's web route (dialog-opening
 *      ?action= for sheet-style tasks); android-only tasks never render;
 *      a task without a web route has NO button (hidden, not greyed).
 *   3. Permission gating — a member lacking a capability does not see the
 *      gated task/screen at all (hide-not-grey: no .Mui-disabled anywhere).
 *   4. Search filters live; the clear button restores the full guide.
 *   5. Menu home has the Help row; the app shell carries the contextual
 *      "Help for this screen" button (→ /menu/help?hl=<screen>) left of the
 *      kebab, and a <link rel="help"> to the public page of the current screen.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { NextIntlClientProvider } from 'next-intl';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import theme from '@/theme/theme';
import en from '../messages/en.json';
import hi from '../messages/hi.json';
import HelpScreen from '@/app/[locale]/(app)/menu/_components/HelpScreen';
import MenuHome from '@/app/[locale]/(app)/menu/_components/MenuHome';
import AppShell from '@/components/AppShell';
import { HELP_GUIDE, filterGuideForWeb, publicHelpUrl } from '@/lib/help/guide';
import { emptyPermissions } from '@/lib/permissions/permissions';

const mockUseMembership = jest.fn();
jest.mock('@/lib/permissions/useMembership', () => ({
  useMembership: () => mockUseMembership(),
}));
jest.mock('@/lib/hooks/useSignedIn', () => ({ useSignedIn: () => true }));
jest.mock('@/lib/guest/guest', () => ({ isGuestMode: jest.fn(() => false) }));
jest.mock('@/lib/outbox/useOutbox', () => ({ useOutbox: () => ({ pendingCount: 0, syncing: false }) }));
jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(() => null),
  createRemoteClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn(async () => ({ data: { user: { email: 'owner@example.com' } }, error: null })),
      getSession: jest.fn(async () => ({ data: { session: { user: { id: 'u1' } } } })),
    },
  })),
}));

let mockPathname = '/booking';
jest.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children?: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => mockPathname,
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

function withProviders(ui: React.ReactElement, locale: 'en' | 'hi' = 'en', messages: Messages = en) {
  return render(
    <ThemeProvider theme={theme}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        {ui}
      </NextIntlClientProvider>
    </ThemeProvider>,
  );
}

const ownerGuide = filterGuideForWeb(HELP_GUIDE.screens, { isOwner: true, permissions: emptyPermissions() });
const bookingCard = ownerGuide.find((s) => s.id === 'booking_card')!;
const recordPayment = bookingCard.tasks.find((t) => t.id === 'record_payment')!;

beforeEach(() => {
  jest.clearAllMocks();
  mockUseMembership.mockReturnValue(membership());
  mockPathname = '/booking';
  window.history.replaceState(null, '', '/');
  // jsdom has no layout; useHighlightParam scrolls the targeted section.
  Element.prototype.scrollIntoView = jest.fn();
});

/** Expands a task accordion (its summary is a <button>) and returns the details panel. */
function expandTask(section: HTMLElement, screenId: string, taskId: string, title: string): HTMLElement {
  fireEvent.click(within(section).getByText(title).closest('button')!);
  return document.getElementById(`help-${screenId}-${taskId}`)!;
}

describe('Help page renders the guide in the UI language', () => {
  for (const [locale, messages] of [
    ['en', en],
    ['hi', hi as Messages],
  ] as const) {
    it(`${locale}: title, every visible screen + task title, numbered steps`, () => {
      withProviders(<HelpScreen title={messages.common.menu.help} />, locale, messages);
      expect(screen.getByRole('heading', { level: 1, name: messages.common.menu.help })).toBeInTheDocument();
      expect(screen.getByText(messages.menu.help.intro)).toBeInTheDocument();
      expect(screen.getByLabelText(messages.menu.help.search_placeholder)).toBeInTheDocument();

      for (const guideScreen of ownerGuide) {
        const section = document.getElementById(`hl-${guideScreen.id}`)!;
        expect(section).not.toBeNull();
        expect(within(section).getByRole('heading', { level: 2, name: guideScreen.title[locale] })).toBeInTheDocument();
        expect(within(section).getByText(guideScreen.summary[locale])).toBeInTheDocument();
        for (const task of guideScreen.tasks) {
          expect(within(section).getByText(task.title[locale])).toBeInTheDocument();
        }
        // The public page link for this section, in this language.
        expect(within(section).getByLabelText(messages.menu.help.open_online)).toHaveAttribute(
          'href',
          publicHelpUrl(locale, guideScreen.id),
        );
      }

      // Steps of a task render as an ordered list in order, in this language
      // (collapsed until the task is expanded — one tap, like Android).
      const section = document.getElementById('hl-booking_card')!;
      expect(within(section).queryAllByRole('listitem')).toHaveLength(0);
      const panel = expandTask(section, 'booking_card', 'record_payment', recordPayment.title[locale]);
      const items = within(panel)
        .getAllByRole('listitem')
        .map((li) => li.textContent);
      expect(items).toEqual(recordPayment.steps.map((step) => step[locale]));
      expect(within(panel).getByRole('list').tagName).toBe('OL');
      // No other-language leakage: the hi page never shows the en step text.
      const other = locale === 'en' ? 'hi' : 'en';
      expect(items).not.toContain(recordPayment.steps[0]![other]);
    });
  }

  it('android-only tasks never render; every rendered task has a Show me (or none when the web lacks the route)', () => {
    withProviders(<HelpScreen title={en.common.menu.help} />);
    // pending_reminders is android-only on the booking calendar.
    const androidOnly = HELP_GUIDE.screens
      .find((s) => s.id === 'booking_calendar')!
      .tasks.find((t) => t.id === 'pending_reminders')!;
    expect(screen.queryByText(androidOnly.title.en)).not.toBeInTheDocument();

    // Show me on a sheet-style task opens the dialog on the right page.
    const calendar = document.getElementById('hl-booking_calendar')!;
    const addBooking = HELP_GUIDE.screens.find((s) => s.id === 'booking_calendar')!.tasks.find((t) => t.id === 'add_booking')!;
    const panel = expandTask(calendar, 'booking_calendar', 'add_booking', addBooking.title.en);
    expect(within(panel).getByRole('link', { name: en.menu.help.show_me })).toHaveAttribute('href', '/booking?action=new_booking');

    // Collapsed panels are not mounted (73 tasks — only the open one renders
    // its steps); a plain-route task's Show me is the bare app path.
    const changeMonth = HELP_GUIDE.screens.find((s) => s.id === 'booking_calendar')!.tasks.find((t) => t.id === 'change_month')!;
    const monthPanel = expandTask(calendar, 'booking_calendar', 'change_month', changeMonth.title.en);
    expect(within(monthPanel).getByRole('link', { name: en.menu.help.show_me })).toHaveAttribute('href', '/booking');
    // Every mounted Show me is an app route, never the public site.
    for (const link of screen.getAllByRole('link', { name: en.menu.help.show_me })) {
      expect(link.getAttribute('href')).toMatch(/^\/(booking|expenses|inventory|notes|files|menu|sign-in)/);
    }
  });

  it('member lacking the capability: gated tasks/screens are absent — hidden, not disabled', () => {
    const permissions = emptyPermissions();
    permissions.booking.view = true; // may read bookings, nothing else
    mockUseMembership.mockReturnValue(membership({ isOwner: false, permissions }));
    withProviders(<HelpScreen title={en.common.menu.help} />);
    // record_payment needs booking.record_payment → gone.
    expect(screen.queryByText(recordPayment.title.en)).not.toBeInTheDocument();
    // Members screen needs settings.manage_members → gone entirely.
    expect(document.getElementById('hl-members')).toBeNull();
    // Ungated content on a visible screen stays.
    const openBooking = HELP_GUIDE.screens.find((s) => s.id === 'booking_calendar')!.tasks.find((t) => t.id === 'open_booking')!;
    expect(screen.getByText(openBooking.title.en)).toBeInTheDocument();
    expect(document.querySelectorAll('.Mui-disabled')).toHaveLength(0);
  });

  it('degraded (Supabase unconfigured) fails open like the chrome: the full web guide renders', () => {
    mockUseMembership.mockReturnValue(membership({ supabase: null, isOwner: false }));
    withProviders(<HelpScreen title={en.common.menu.help} />);
    expect(document.getElementById('hl-members')).not.toBeNull();
    expect(screen.getByText(recordPayment.title.en)).toBeInTheDocument();
  });

  it('search narrows to matching screens/tasks (expanded), shows the empty state, and clears', () => {
    withProviders(<HelpScreen title={en.common.menu.help} />);
    const input = screen.getByLabelText(en.menu.help.search_placeholder);
    fireEvent.change(input, { target: { value: recordPayment.title.en } });
    expect(screen.getByText(recordPayment.title.en)).toBeInTheDocument();
    // Matched tasks are expanded so the steps are visible without a click.
    expect(screen.getByText(recordPayment.steps[0]!.en)).toBeInTheDocument();
    expect(document.getElementById('help-booking_card-record_payment-header')).toHaveAttribute('aria-expanded', 'true');
    // An unrelated screen is gone.
    expect(document.getElementById('hl-members')).toBeNull();

    fireEvent.change(input, { target: { value: 'zzqqxx99' } });
    expect(screen.getByText(en.menu.help.no_results)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(en.menu.search.clear));
    expect(document.getElementById('hl-members')).not.toBeNull();
  });

  it('?hl=<screenId> highlights that screen section (contextual entry)', () => {
    window.history.replaceState(null, '', '/menu/help?hl=files');
    withProviders(<HelpScreen title={en.common.menu.help} />);
    const files = document.getElementById('hl-files')!;
    expect(files).toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    // highlightSx tints the section (action.selected) while the anchor is active.
    expect(getComputedStyle(files).backgroundColor).not.toBe('');
    expect(getComputedStyle(files).backgroundColor).not.toBe(getComputedStyle(document.getElementById('hl-notes')!).backgroundColor);
  });
});

describe('entry points', () => {
  it('Menu home lists the Help row (shared common.menu.help) between Members and About, linking to /menu/help', () => {
    withProviders(<MenuHome title={en.menu.home.title} />);
    const row = screen.getByText(en.common.menu.help).closest('a')!;
    expect(row).toHaveAttribute('href', '/menu/help');
    expect(screen.getByText(en.menu.help.subtitle)).toBeInTheDocument();
    const titles = Array.from(document.querySelectorAll('.MuiListItemText-primary')).map((el) => el.textContent);
    const members = titles.indexOf(en.menu.section.members);
    const help = titles.indexOf(en.common.menu.help);
    const about = titles.indexOf(en.menu.section.about);
    expect(members).toBeLessThan(help);
    expect(help).toBeLessThan(about);
  });

  it('Menu home (hi): Help row title comes from the hi catalog', () => {
    withProviders(<MenuHome title={hi.menu.home.title} />, 'hi', hi as Messages);
    expect(screen.getByText(hi.common.menu.help).closest('a')).toHaveAttribute('href', '/menu/help');
  });

  for (const [path, screenId] of [
    ['/booking', 'booking_calendar'],
    ['/expenses/p1', 'expenses_ledger'],
    ['/inventory/masterlist', 'inventory_masterlist'],
    ['/files/a/b', 'files'],
    ['/menu/settings/sync', 'settings'],
  ] as const) {
    it(`app shell on ${path}: "Help for this screen" → /menu/help?hl=${screenId}, left of the kebab, with <link rel="help">`, () => {
      mockPathname = path;
      withProviders(
        <AppShell>
          <div />
        </AppShell>,
      );
      const help = screen.getByLabelText(en.menu.help.for_this_screen);
      expect(help).toHaveAttribute('href', `/menu/help?hl=${screenId}`);
      const toolbar = help.closest('.MuiToolbar-root')!;
      // Kebab stays the last toolbar control (pinned by kebab-menu.test); help sits just before it.
      const kebab = document.querySelector('[data-testid="MoreVertIcon"]')!.closest('a')!;
      expect(toolbar.lastElementChild).toBe(kebab);
      expect(help.nextElementSibling).toBe(kebab);
      expect(kebab).toHaveAttribute('href', '/menu');
      // Public-guide metadata for this screen, in the UI language.
      const link = document.head.querySelector('link[rel="help"]') ?? document.querySelector('link[rel="help"]');
      expect(link).toHaveAttribute('href', publicHelpUrl('en', screenId));
    });
  }

  it('app shell on the Help page itself: no contextual button, rel=help points at the index', () => {
    mockPathname = '/menu/help';
    withProviders(
      <AppShell>
        <div />
      </AppShell>,
      'hi',
      hi as Messages,
    );
    expect(screen.queryByLabelText(hi.menu.help.for_this_screen)).not.toBeInTheDocument();
    const link = document.head.querySelector('link[rel="help"]') ?? document.querySelector('link[rel="help"]');
    expect(link).toHaveAttribute('href', publicHelpUrl('hi', null));
  });
});
