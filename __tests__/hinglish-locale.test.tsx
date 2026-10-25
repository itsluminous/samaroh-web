/**
 * Hinglish (`hi-Latn`) as the third app locale (shared docs/hinglish.md):
 *   1. routing exposes exactly en | hi | hi-Latn; pathname locale detection is a
 *      whole-segment match (`/hi-Latn/...` is never read as `hi`);
 *   2. the generated hi-Latn message bundle mirrors en structurally and is
 *      Latin-script (no Devanagari unless the value is identical to en — the
 *      own-script language names);
 *   3. the language picker lists Hinglish (catalog key `name_hi_latn`), ticks
 *      ONLY the exact current locale, and switches by locale tag; the Settings
 *      row shows the current language's own-script name;
 *   4. date/number formatting under hi-Latn uses `en-IN` (Latin digits, English
 *      month/weekday names) through `intlLocale` / `useAppFormatter`;
 *   5. Help under hi-Latn: search works over hi-Latn text, public URLs and
 *      <link rel="help"> target /help/hi-Latn/;
 *   6. the invoice text receipt follows the UI language (hi-Latn labels + dates).
 */
import { fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { NextIntlClientProvider } from 'next-intl';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import theme from '@/theme/theme';
import en from '../messages/en.json';
import hi from '../messages/hi.json';
import hiLatn from '../messages/hi-Latn.json';
import LanguageScreen from '@/app/[locale]/(app)/menu/_components/LanguageScreen';
import SettingsScreen from '@/app/[locale]/(app)/menu/_components/SettingsScreen';
import AlternateLinks, { alternateHrefs } from '@/components/AlternateLinks';
import HelpLink from '@/components/HelpLink';
import { localeOf, stripLocale } from '@/i18n/pathLocale';
import { localeKeySuffix, routing } from '@/i18n/routing';
import { formatDate, formatMonthName, formatTime, weekdayNarrowNames } from '@/lib/booking/dates';
import { intlLocale } from '@/lib/format/intlLocale';
import { useAppFormatter } from '@/lib/format/useAppFormatter';
import { HELP_GUIDE, filterGuideForWeb, publicHelpUrl, searchGuide } from '@/lib/help/guide';
import { buildTextReceipt } from '@/lib/invoice/receipt';
import type { InvoiceData, InvoiceLabels } from '@/lib/invoice/types';
import { emptyPermissions } from '@/lib/permissions/permissions';

type Messages = typeof en;

const mockReplace = jest.fn();
let mockPathname = '/menu/settings/language';
jest.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children?: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
  usePathname: () => mockPathname,
  // Real locale-prefixing (pure, no React context needed) so the alternates
  // test exercises next-intl's own path building.
  getPathname: jest.requireActual('@/i18n/navigation').getPathname,
}));
jest.mock('@/lib/permissions/useMembership', () => ({
  useMembership: () => ({
    supabase: null,
    business: null,
    userId: null,
    isOwner: false,
    permissions: emptyPermissions(),
    loading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));
jest.mock('@/lib/outbox/useOutbox', () => ({
  useOutbox: () => ({ pendingCount: 0, syncing: false }),
}));
jest.mock('@/lib/booking/eventTypePresets', () => ({
  ...jest.requireActual('@/lib/booking/eventTypePresets'),
  fetchEventTypes: jest.fn(() => Promise.resolve([])),
}));

const DEVANAGARI = /[\u0900-\u097F]/;

function withProviders(ui: React.ReactElement, locale: string, messages: Messages) {
  return render(
    <ThemeProvider theme={theme}>
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
        {ui}
      </NextIntlClientProvider>
    </ThemeProvider>,
  );
}

function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') {
      Object.assign(out, flatten(value as Record<string, unknown>, path));
    } else {
      out[path] = String(value);
    }
  }
  return out;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPathname = '/menu/settings/language';
});

describe('routing: three locales', () => {
  it('routes exactly en, hi and hi-Latn with en as the default', () => {
    expect([...routing.locales]).toEqual(['en', 'hi', 'hi-Latn']);
    expect(routing.defaultLocale).toBe('en');
    expect(routing.localePrefix).toBe('always');
  });

  it('maps a locale tag to its snake_case catalog key suffix', () => {
    expect(localeKeySuffix('en')).toBe('en');
    expect(localeKeySuffix('hi')).toBe('hi');
    expect(localeKeySuffix('hi-Latn')).toBe('hi_latn');
  });

  it.each([
    ['/en/booking', 'en', '/booking'],
    ['/hi/booking', 'hi', '/booking'],
    ['/hi-Latn/booking', 'hi-Latn', '/booking'],
    ['/hi-Latn', 'hi-Latn', '/'],
    ['/hi-Latn/menu/help', 'hi-Latn', '/menu/help'],
    ['/hi', 'hi', '/'],
    ['/booking', 'en', '/booking'],
    ['/hi-latn/booking', 'en', '/hi-latn/booking'], // tags are case-sensitive in routing
  ])('%s → locale %s, bare path %s', (pathname, locale, bare) => {
    expect(localeOf(pathname)).toBe(locale);
    expect(stripLocale(pathname)).toBe(bare);
  });

  it('emits hreflang alternates for every locale + x-default on the same page', () => {
    expect(alternateHrefs('/booking')).toEqual([
      { hreflang: 'en', href: '/en/booking' },
      { hreflang: 'hi', href: '/hi/booking' },
      { hreflang: 'hi-Latn', href: '/hi-Latn/booking' },
      { hreflang: 'x-default', href: '/en/booking' },
    ]);
    mockPathname = '/booking';
    withProviders(<AlternateLinks />, 'hi-Latn', hiLatn as Messages);
    const links = Array.from(document.querySelectorAll('link[rel="alternate"]'));
    expect(links.map((l) => l.getAttribute('hreflang'))).toEqual(['en', 'hi', 'hi-Latn', 'x-default']);
    expect(links.find((l) => l.getAttribute('hreflang') === 'hi-Latn')).toHaveAttribute('href', '/hi-Latn/booking');
  });
});

describe('hi-Latn message bundle', () => {
  const enFlat = flatten(en as unknown as Record<string, unknown>);
  const hiLatnFlat = flatten(hiLatn as unknown as Record<string, unknown>);

  it('has the same key set as en and hi', () => {
    const keys = (m: Record<string, string>) => Object.keys(m).sort();
    expect(keys(hiLatnFlat)).toEqual(keys(enFlat));
    expect(keys(hiLatnFlat)).toEqual(keys(flatten(hi as unknown as Record<string, unknown>)));
    expect(keys(hiLatnFlat).length).toBeGreaterThan(1000);
  });

  it('is Latin-script: no Devanagari unless the value is identical to en (own-script names)', () => {
    const offenders = Object.entries(hiLatnFlat)
      .filter(([key, value]) => DEVANAGARI.test(value) && value !== enFlat[key])
      .map(([key]) => key);
    expect(offenders).toEqual([]);
  });

  it('names Hinglish identically in every locale (own-script picker labels)', () => {
    for (const messages of [en, hi, hiLatn] as Messages[]) {
      expect(messages.settings.language.name_hi_latn).toBe('Hinglish');
      expect(messages.common.language.hi_latn).toBe('Hinglish');
      expect(messages.settings.language.name_en).toBe(en.settings.language.name_en);
      expect(messages.settings.language.name_hi).toBe(en.settings.language.name_hi);
    }
  });

  it('is genuinely Hinglish, not a copy of en or hi', () => {
    const differsFromEn = Object.entries(hiLatnFlat).filter(([key, value]) => value !== enFlat[key]).length;
    expect(differsFromEn).toBeGreaterThan(500);
    expect(hiLatn.common.nav.expenses).not.toBe(en.common.nav.expenses);
    expect(hiLatn.common.nav.expenses).not.toBe(hi.common.nav.expenses);
  });
});

describe('language switcher', () => {
  it('lists English, हिन्दी and Hinglish; ticks only the exact current locale (hi-Latn ≠ hi)', () => {
    withProviders(<LanguageScreen />, 'hi-Latn', hiLatn as Messages);
    expect(screen.getByRole('heading', { level: 1, name: hiLatn.settings.language.picker_title })).toBeInTheDocument();
    const rows = screen.getAllByRole('button');
    expect(rows.map((r) => r.textContent)).toEqual([
      en.settings.language.name_en,
      en.settings.language.name_hi,
      en.settings.language.name_hi_latn,
    ]);
    const selected = rows.filter((r) => r.classList.contains('Mui-selected'));
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent('Hinglish');
    expect(within(selected[0]!).getByTestId('CheckIcon')).toBeInTheDocument();
  });

  it('under hi, the Hindi row (not Hinglish) is selected', () => {
    withProviders(<LanguageScreen />, 'hi', hi as Messages);
    const selected = screen.getAllByRole('button').filter((r) => r.classList.contains('Mui-selected'));
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent(hi.settings.language.name_hi);
  });

  it('picking Hinglish replaces the current path under the hi-Latn locale', () => {
    withProviders(<LanguageScreen />, 'en', en);
    fireEvent.click(screen.getByText('Hinglish'));
    expect(mockReplace).toHaveBeenCalledWith('/menu/settings/language', { locale: 'hi-Latn' });
  });

  it('Settings row shows the current language name for every locale', () => {
    for (const [locale, messages, name] of [
      ['en', en, en.settings.language.name_en],
      ['hi', hi as Messages, en.settings.language.name_hi],
      ['hi-Latn', hiLatn as Messages, 'Hinglish'],
    ] as const) {
      const { unmount } = withProviders(<SettingsScreen />, locale, messages);
      const row = screen.getByText(messages.settings.language.title).closest('a')!;
      expect(row).toHaveAttribute('href', '/menu/settings/language');
      expect(within(row).getByText(name)).toBeInTheDocument();
      unmount();
    }
  });
});

describe('formatting under hi-Latn uses en-IN', () => {
  it('maps only hi-Latn; en and hi pass through', () => {
    expect(intlLocale('hi-Latn')).toBe('en-IN');
    expect(intlLocale('en')).toBe('en');
    expect(intlLocale('hi')).toBe('hi');
  });

  it('booking dates: Latin digits, English month and weekday names, 12-hour time', () => {
    expect(formatDate('2026-07-10', 'hi-Latn')).toBe(formatDate('2026-07-10', 'en-IN'));
    expect(formatDate('2026-07-10', 'hi-Latn')).toMatch(/^10 Jul 2026$/);
    expect(formatDate('2026-07-10', 'hi')).toMatch(DEVANAGARI);
    expect(formatMonthName(0, 'hi-Latn')).toBe('January');
    expect(weekdayNarrowNames('hi-Latn')).toEqual(weekdayNarrowNames('en-IN'));
    expect(weekdayNarrowNames('hi-Latn').join('')).not.toMatch(DEVANAGARI);
    expect(formatTime('14:30', 'hi-Latn')).toMatch(/^2:30\s?pm$/i);
  });

  it('useAppFormatter formats dates, numbers and relative time as en-IN', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <NextIntlClientProvider locale="hi-Latn" messages={hiLatn as Messages} timeZone="UTC">
        {children}
      </NextIntlClientProvider>
    );
    const { result } = renderHook(() => useAppFormatter(), { wrapper });
    const date = new Date(Date.UTC(2026, 9, 25, 10, 30));
    expect(result.current.dateTime(date, { month: 'long', day: 'numeric', year: 'numeric' })).toBe('25 October 2026');
    expect(result.current.number(1234567.5, { maximumFractionDigits: 1 })).toBe('12,34,567.5');
    const rel = result.current.relativeTime(new Date(date.getTime() - 3 * 86_400_000), date);
    expect(rel).toBe('3 days ago');
  });
});

describe('Help under hi-Latn', () => {
  const guide = filterGuideForWeb(HELP_GUIDE.screens, { isOwner: true, permissions: emptyPermissions() });

  it('every web screen, task and step has hi-Latn text (Latin script)', () => {
    for (const s of guide) {
      expect(s.title['hi-Latn']).toBeTruthy();
      expect(s.summary['hi-Latn']).toBeTruthy();
      for (const t of s.tasks) {
        expect(t.title['hi-Latn']).toBeTruthy();
        for (const step of t.steps) {
          expect(step['hi-Latn']).toBeTruthy();
        }
      }
    }
  });

  it('search matches hi-Latn task titles in the hi-Latn guide', () => {
    const task = guide.find((s) => s.id === 'booking_calendar')!.tasks.find((t) => t.id === 'add_booking')!;
    const hits = searchGuide(task.title['hi-Latn'], guide, 'hi-Latn');
    expect(hits.some((s) => s.tasks.some((t) => t.id === 'add_booking'))).toBe(true);
    expect(hits.length).toBeLessThan(guide.length);
  });

  it('public URLs and <link rel="help"> target the hi-Latn Pages directory', () => {
    expect(publicHelpUrl('hi-Latn', 'booking_card')).toBe(`${HELP_GUIDE.site.baseUrl}hi-Latn/booking_card.html`);
    expect(publicHelpUrl('hi-Latn', null)).toBe(`${HELP_GUIDE.site.baseUrl}hi-Latn/index.html`);
    mockPathname = '/inventory/masterlist';
    withProviders(<HelpLink />, 'hi-Latn', hiLatn as Messages);
    const link = document.head.querySelector('link[rel="help"]') ?? document.querySelector('link[rel="help"]');
    expect(link).toHaveAttribute('href', `${HELP_GUIDE.site.baseUrl}hi-Latn/inventory_masterlist.html`);
  });
});

describe('invoice text receipt follows the hi-Latn UI language', () => {
  function labelsFrom(catalog: Messages): InvoiceLabels {
    const inv = catalog.invoice;
    return {
      title: inv.title,
      numberLabel: inv.number_label,
      issueDateLabel: inv.issue_date_label,
      billedTo: inv.billed_to,
      eventLabel: inv.event_label,
      notesTitle: inv.notes_title,
      totalAmount: inv.total_amount,
      securityDeposit: inv.security_deposit,
      paymentHistory: inv.payment_history,
      tableDate: inv.table.date,
      tableMethod: inv.table.method,
      tableNotes: inv.table.notes,
      tableAmount: inv.table.amount,
      totalPaid: inv.total_paid,
      balanceDue: inv.balance_due,
      fullyPaid: inv.fully_paid,
      noPayments: inv.no_payments,
      footer: inv.footer,
    };
  }
  const data: InvoiceData = {
    businessName: 'Shree Ganesh Hall',
    address: null,
    ownerName: 'Suresh Gupta',
    invoiceNumber: 'SGH-2026-0042',
    issueDate: '2026-07-15',
    customerName: 'Ramesh Kumar',
    customerPhone: '9876543210',
    eventIcon: '\u{1F492}',
    eventLabel: hiLatn.booking.event_type.wedding,
    startDate: '2026-07-10',
    endDate: '2026-07-12',
    startTime: null,
    endTime: null,
    notes: null,
    totalAmount: 106511,
    securityDeposit: 5000,
    payments: [{ paidOn: '2026-07-01', methodLabel: hiLatn.invoice.method.cash, notes: null, amount: 50000 }],
  };

  it('uses hi-Latn labels, Indian ₹ grouping and en-IN dates, with no Devanagari', () => {
    const receipt = buildTextReceipt(data, labelsFrom(hiLatn as Messages), 'hi-Latn');
    expect(receipt).toContain(hiLatn.invoice.total_amount);
    expect(receipt).toContain(hiLatn.invoice.balance_due);
    expect(receipt).toContain(hiLatn.invoice.footer);
    expect(receipt).toContain(hiLatn.booking.event_type.wedding);
    expect(receipt).toContain('\u20B91,06,511');
    expect(receipt).toContain('15 Jul 2026');
    expect(receipt).toContain('10 Jul 2026');
    expect(receipt).not.toMatch(DEVANAGARI);
  });
});
