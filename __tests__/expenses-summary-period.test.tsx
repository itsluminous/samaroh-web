/**
 * Expenses home summary card — period switch (This month / This year /
 * All time). Defaults to THIS MONTH, totals follow the chosen period by
 * `expense_date`, the choice persists in localStorage and is restored on the
 * next mount, masked amounts (view_amounts=false) stay masked in every
 * period, the amounts render through the single-line autoshrink wrapper, and
 * the Hindi catalog labels the segments.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import theme from '@/theme/theme';
import en from '../messages/en.json';
import hi from '../messages/hi.json';
import ExpensesHome from '@/app/[locale]/(app)/expenses/_components/ExpensesHome';
import { AMOUNT_MASK } from '@/components/MaskedAmount';
import { SUMMARY_PERIOD_STORAGE_KEY, localYear, localYearMonth } from '@/lib/expenses/summaryPeriod';
import { formatAmount } from '@/lib/format/amount';
import type { MemberPermissions } from '@/lib/permissions/permissions';
import { normalizePermissions } from '@/lib/permissions/permissions';

const mockUseMembership = jest.fn();
jest.mock('@/lib/permissions/useMembership', () => ({
  useMembership: () => mockUseMembership(),
}));

jest.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  Link: ({ children, ...props }: { children: ReactNode; href: string }) => <a {...props}>{children}</a>,
}));

// --- Fixture: one entry this month, one earlier this year, one last year -----

const now = new Date();
const thisMonth = localYearMonth(now);
const thisYear = localYear(now);
// A month of THIS year that is not the current one (December if it is January).
const otherMonthThisYear = `${thisYear}-${now.getMonth() === 0 ? '12' : '01'}`;
const lastYear = String(now.getFullYear() - 1);

const party = { id: 'p1', name: 'Tent House', phone: null, business_related: true, created_at: '2024-01-01T00:00:00Z' };

function expense(id: string, direction: 'paid' | 'received', amount: number, expense_date: string) {
  return {
    id,
    party_id: 'p1',
    direction,
    amount,
    expense_date,
    notes: null,
    created_at: `${expense_date}T09:00:00Z`,
    expense_attachments: [],
  };
}

const expenses = [
  expense('m-gave', 'paid', 1000, `${thisMonth}-01`),
  expense('m-got', 'received', 50, `${thisMonth}-01`),
  expense('y-gave', 'paid', 20000, `${otherMonthThisYear}-15`),
  expense('y-got', 'received', 700, `${otherMonthThisYear}-15`),
  expense('old-gave', 'paid', 300000, `${lastYear}-06-30`),
  expense('old-got', 'received', 9000, `${lastYear}-06-30`),
];

const EXPECTED = {
  month: { gave: 1000, got: 50 },
  year: { gave: 21000, got: 750 },
  all: { gave: 321000, got: 9750 },
};

jest.mock('@/app/[locale]/(app)/expenses/_lib/queries', () => ({
  ...jest.requireActual('@/app/[locale]/(app)/expenses/_lib/queries'),
  fetchParties: jest.fn(() => Promise.resolve([party])),
  fetchBusinessExpenses: jest.fn(() => Promise.resolve(expenses)),
}));

function membership(permissions: MemberPermissions, isOwner: boolean) {
  return {
    supabase: {},
    business: { id: 'b1', name: 'Biz' },
    userId: 'u1',
    isOwner,
    permissions,
    loading: false,
    error: null,
    refresh: jest.fn(),
  };
}

type Messages = typeof en;

function renderHome(messages: Messages = en, locale: 'en' | 'hi' = 'en') {
  return render(
    <ThemeProvider theme={theme}>
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Kolkata" now={now}>
        <ExpensesHome />
      </NextIntlClientProvider>
    </ThemeProvider>,
  );
}

const gave = () => screen.getByTestId('summary-gave');
const got = () => screen.getByTestId('summary-got');
const segment = (label: string) => screen.getByRole('button', { name: label, pressed: undefined });

async function waitForCard() {
  await waitFor(() => expect(screen.getByTestId('summary-gave')).toBeInTheDocument());
}

function expectTotals(period: keyof typeof EXPECTED) {
  expect(gave()).toHaveTextContent(formatAmount(EXPECTED[period].gave));
  expect(got()).toHaveTextContent(formatAmount(EXPECTED[period].got));
}

beforeEach(() => {
  window.localStorage.clear();
  // Owner: every module visible, amounts shown (isOwner short-circuits the checks).
  mockUseMembership.mockReturnValue(membership(normalizePermissions({ expenses: { view: true } }), true));
});

describe('ExpensesHome summary period switch', () => {
  it('defaults to THIS MONTH and totals only the current month', async () => {
    renderHome();
    await waitForCard();
    const group = screen.getByRole('group', { name: en.expenses.summary.period_label });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual([
      en.expenses.summary.period_month,
      en.expenses.summary.period_year,
      en.expenses.summary.period_all,
    ]);
    expect(segment(en.expenses.summary.period_month)).toHaveAttribute('aria-pressed', 'true');
    expectTotals('month');
    // Nothing persisted until the user chooses.
    expect(window.localStorage.getItem(SUMMARY_PERIOD_STORAGE_KEY)).toBeNull();
  });

  it('switches to THIS YEAR and ALL TIME, recomputing totals by expense_date', async () => {
    renderHome();
    await waitForCard();

    fireEvent.click(segment(en.expenses.summary.period_year));
    expect(segment(en.expenses.summary.period_year)).toHaveAttribute('aria-pressed', 'true');
    expectTotals('year');
    expect(window.localStorage.getItem(SUMMARY_PERIOD_STORAGE_KEY)).toBe('year');

    fireEvent.click(segment(en.expenses.summary.period_all));
    expect(segment(en.expenses.summary.period_all)).toHaveAttribute('aria-pressed', 'true');
    expectTotals('all');
    expect(window.localStorage.getItem(SUMMARY_PERIOD_STORAGE_KEY)).toBe('all');

    fireEvent.click(segment(en.expenses.summary.period_month));
    expectTotals('month');
    expect(window.localStorage.getItem(SUMMARY_PERIOD_STORAGE_KEY)).toBe('month');
  });

  it('tapping the already-selected segment keeps it selected (never zero periods)', async () => {
    renderHome();
    await waitForCard();
    fireEvent.click(segment(en.expenses.summary.period_month));
    expect(segment(en.expenses.summary.period_month)).toHaveAttribute('aria-pressed', 'true');
    expectTotals('month');
  });

  it('restores the persisted period on the next mount', async () => {
    window.localStorage.setItem(SUMMARY_PERIOD_STORAGE_KEY, 'all');
    renderHome();
    await waitForCard();
    expect(segment(en.expenses.summary.period_all)).toHaveAttribute('aria-pressed', 'true');
    expectTotals('all');
  });

  it('ignores an unknown persisted value and falls back to THIS MONTH', async () => {
    window.localStorage.setItem(SUMMARY_PERIOD_STORAGE_KEY, 'decade');
    renderHome();
    await waitForCard();
    expect(segment(en.expenses.summary.period_month)).toHaveAttribute('aria-pressed', 'true');
    expectTotals('month');
  });

  it('does not change the per-party balances (all-time) when the period changes', async () => {
    renderHome();
    await waitForCard();
    const allTimeNet = formatAmount(EXPECTED.all.gave - EXPECTED.all.got);
    expect(screen.getByText(allTimeNet)).toBeInTheDocument();
    fireEvent.click(segment(en.expenses.summary.period_year));
    expect(screen.getByText(allTimeNet)).toBeInTheDocument();
  });

  it('keeps amounts masked in every period when view_amounts is false', async () => {
    mockUseMembership.mockReturnValue(
      membership(normalizePermissions({ expenses: { view: true, view_amounts: false } }), false),
    );
    renderHome();
    await waitForCard();
    for (const label of [
      en.expenses.summary.period_year,
      en.expenses.summary.period_all,
      en.expenses.summary.period_month,
    ]) {
      fireEvent.click(segment(label));
      expect(gave()).toHaveTextContent(AMOUNT_MASK);
      expect(got()).toHaveTextContent(AMOUNT_MASK);
      expect(screen.queryByText(formatAmount(EXPECTED.all.gave))).toBeNull();
      expect(screen.queryByText(formatAmount(EXPECTED.month.gave))).toBeNull();
    }
    // Switching still persists for a masked member — it is a layout preference.
    expect(window.localStorage.getItem(SUMMARY_PERIOD_STORAGE_KEY)).toBe('month');
  });

  it('renders the amounts through the single-line autoshrink wrapper', async () => {
    renderHome();
    await waitForCard();
    for (const cell of [gave(), got()]) {
      const wrapper = cell.firstElementChild as HTMLElement;
      expect(wrapper.tagName).toBe('SPAN');
      expect(wrapper).toHaveStyle({ whiteSpace: 'nowrap', overflow: 'hidden' });
    }
  });

  it('renders the cell labels and the period segments single-line (shrink, never wrap or ellipsize)', async () => {
    renderHome();
    await waitForCard();
    // "You gave" / "You got" labels — Android parity: autoshrink, not ellipsis.
    for (const label of [screen.getByText(en.expenses.home.you_gave), screen.getByText(en.expenses.home.you_got)]) {
      expect(label.tagName).toBe('SPAN');
      expect(label).toHaveStyle({ whiteSpace: 'nowrap', overflow: 'hidden' });
      expect(label).not.toHaveStyle({ textOverflow: 'ellipsis' });
    }
    // Segment labels sit in a flex-filling autoshrink span inside each button.
    const group = screen.getByRole('group', { name: en.expenses.summary.period_label });
    for (const button of within(group).getAllByRole('button')) {
      const label = button.firstElementChild as HTMLElement;
      expect(label.tagName).toBe('SPAN');
      expect(label).toHaveStyle({ whiteSpace: 'nowrap', overflow: 'hidden', flex: '1 1 0' });
    }
  });

  it('labels the segments from the Hindi catalog', async () => {
    renderHome(hi as Messages, 'hi');
    await waitForCard();
    const group = screen.getByRole('group', { name: hi.expenses.summary.period_label });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual([
      hi.expenses.summary.period_month,
      hi.expenses.summary.period_year,
      hi.expenses.summary.period_all,
    ]);
    fireEvent.click(within(group).getByRole('button', { name: hi.expenses.summary.period_all }));
    expectTotals('all');
  });
});
