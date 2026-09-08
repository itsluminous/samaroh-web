/**
 * Section FABs (expenses add-party, inventory record-transaction) follow the
 * shell's md boundary: icon-only circular on mobile viewports, extended
 * (icon + text) on desktop — the GlassFab glass styling and the aria-label
 * are kept in BOTH modes.
 */
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import { NextIntlClientProvider } from 'next-intl';
import theme from '@/theme/theme';
import en from '../messages/en.json';
import ResponsiveGlassFab from '@/components/ResponsiveGlassFab';
import ExpensesHome from '@/app/[locale]/(app)/expenses/_components/ExpensesHome';
import CurrentStockList from '@/app/[locale]/(app)/inventory/_components/CurrentStockList';

jest.mock('@/lib/permissions/useMembership', () => ({
  useMembership: () => ({
    supabase: {},
    business: { id: 'b1', name: 'Biz' },
    userId: 'u1',
    isOwner: true,
    permissions: {},
    loading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));

jest.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/app/[locale]/(app)/inventory/_lib/queries', () => ({
  fetchCurrentInventory: jest.fn(() => Promise.resolve([])),
  fetchMasterItems: jest.fn(() => Promise.resolve([])),
}));

jest.mock('@/app/[locale]/(app)/expenses/_lib/queries', () => ({
  ...jest.requireActual('@/app/[locale]/(app)/expenses/_lib/queries'),
  fetchParties: jest.fn(() => Promise.resolve([])),
  fetchBusinessExpenses: jest.fn(() => Promise.resolve([])),
}));

/**
 * MUI's useMediaQuery consults window.matchMedia. `desktop: true` makes every
 * min-width query match (the md-and-up branch); jsdom has no real layout.
 */
function setViewport(desktop: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: desktop,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })) as unknown as typeof window.matchMedia;
}

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <ThemeProvider theme={theme}>
      <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Kolkata">
        {ui}
      </NextIntlClientProvider>
    </ThemeProvider>,
  );
}

describe('ResponsiveGlassFab', () => {
  it('mobile: icon-only circular FAB that keeps its aria-label', () => {
    setViewport(false);
    renderWithProviders(
      <ResponsiveGlassFab icon={<AddIcon />} label={en.inventory.stock.record_transaction} onClick={() => {}} />,
    );
    const fab = screen.getByRole('button', { name: en.inventory.stock.record_transaction });
    expect(fab.className).toContain('MuiFab-circular');
    expect(fab).not.toHaveTextContent(en.inventory.stock.record_transaction);
  });

  it('desktop: extended FAB with icon + text', () => {
    setViewport(true);
    renderWithProviders(
      <ResponsiveGlassFab icon={<AddIcon />} label={en.inventory.stock.record_transaction} onClick={() => {}} />,
    );
    const fab = screen.getByRole('button', { name: en.inventory.stock.record_transaction });
    expect(fab.className).toContain('MuiFab-extended');
    expect(fab).toHaveTextContent(en.inventory.stock.record_transaction);
  });
});

describe('section FABs', () => {
  it('inventory record-transaction FAB is icon-only on mobile, extended on desktop', async () => {
    setViewport(false);
    const mobile = renderWithProviders(<CurrentStockList />);
    let fab = await screen.findByLabelText(en.inventory.stock.record_transaction);
    expect(fab.className).toContain('MuiFab-circular');
    mobile.unmount();

    setViewport(true);
    renderWithProviders(<CurrentStockList />);
    fab = await screen.findByLabelText(en.inventory.stock.record_transaction);
    expect(fab.className).toContain('MuiFab-extended');
    expect(fab).toHaveTextContent(en.inventory.stock.record_transaction);
  });

  it('expenses add-person FAB is icon-only on mobile, extended on desktop', async () => {
    setViewport(false);
    const mobile = renderWithProviders(<ExpensesHome />);
    let fab = await screen.findByLabelText(en.expenses.home.add_person);
    expect(fab.className).toContain('MuiFab-circular');
    mobile.unmount();

    setViewport(true);
    renderWithProviders(<ExpensesHome />);
    fab = await screen.findByLabelText(en.expenses.home.add_person);
    expect(fab.className).toContain('MuiFab-extended');
    expect(fab).toHaveTextContent(en.expenses.home.add_person);
  });
});
