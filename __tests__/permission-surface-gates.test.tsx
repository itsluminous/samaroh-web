/**
 * Per-surface write-affordance gates (§3, Android parity): affordances the
 * member lacks are HIDDEN, not disabled — expenses gave/got entry buttons
 * (create), ledger-row edit (edit), entry delete (delete), add/edit party
 * (manage_parties), and the inventory record-transaction FAB (create).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import theme from '@/theme/theme';
import en from '../messages/en.json';
import ExpensesHome from '@/app/[locale]/(app)/expenses/_components/ExpensesHome';
import PartyLedger from '@/app/[locale]/(app)/expenses/_components/PartyLedger';
import CurrentStockList from '@/app/[locale]/(app)/inventory/_components/CurrentStockList';
import { emptyPermissions, type MemberPermissions } from '@/lib/permissions/permissions';

const mockUseMembership = jest.fn();
jest.mock('@/lib/permissions/useMembership', () => ({
  useMembership: () => mockUseMembership(),
}));

// EntryDialog reaches for useBusiness internally.
jest.mock('@/lib/hooks/useBusiness', () => ({
  useBusiness: () => ({ supabase: {}, businessId: 'b1', businessName: 'Biz', userId: 'u1', loading: false, error: null }),
}));

jest.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const party = { id: 'p1', name: 'Tent House', phone: null, business_related: true, updated_at: '2026-01-01T00:00:00Z' };
const expense = {
  id: 'e1',
  party_id: 'p1',
  direction: 'paid' as const,
  amount: 500,
  expense_date: '2026-01-10',
  notes: null,
  created_at: '2026-01-10T00:00:00Z',
  updated_at: '2026-01-10T00:00:00Z',
  expense_attachments: [],
};

jest.mock('@/app/[locale]/(app)/expenses/_lib/queries', () => ({
  ...jest.requireActual('@/app/[locale]/(app)/expenses/_lib/queries'),
  fetchParty: jest.fn(() => Promise.resolve(party)),
  fetchPartyExpenses: jest.fn(() => Promise.resolve([expense])),
  fetchParties: jest.fn(() => Promise.resolve([party])),
  fetchBusinessExpenses: jest.fn(() => Promise.resolve([expense])),
}));

jest.mock('@/app/[locale]/(app)/inventory/_lib/queries', () => ({
  fetchCurrentInventory: jest.fn(() => Promise.resolve([])),
  fetchMasterItems: jest.fn(() => Promise.resolve([])),
  createImageUrls: jest.fn(() => Promise.resolve(new Map())),
}));

function membership(permissions: MemberPermissions, isOwner = false) {
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

function renderIntl(node: ReactNode) {
  return render(
    <ThemeProvider theme={theme}>
      <NextIntlClientProvider locale="en" messages={en}>
        {node}
      </NextIntlClientProvider>
    </ThemeProvider>,
  );
}

const tExp = en.expenses;

describe('PartyLedger write-affordance gates', () => {
  it('hides gave/got entry buttons without expenses.create; row edit without expenses.edit', async () => {
    mockUseMembership.mockReturnValue(membership(withView('expenses')));
    renderIntl(<PartyLedger partyId="p1" />);
    await screen.findByText(party.name);
    expect(screen.queryByText(tExp.ledger.you_gave_button)).not.toBeInTheDocument();
    expect(screen.queryByText(tExp.ledger.you_got_button)).not.toBeInTheDocument();
    // Row is not an edit affordance without expenses.edit.
    expect(screen.queryByRole('button', { name: new RegExp(tExp.home.you_gave) })).not.toBeInTheDocument();
    // Party edit pencil needs manage_parties.
    expect(screen.queryByLabelText(tExp.party.edit_title)).not.toBeInTheDocument();
  });

  it('shows gave/got + row edit + party edit with the permissions granted', async () => {
    const p = withView('expenses');
    p.expenses.create = true;
    p.expenses.edit = true;
    p.expenses.manage_parties = true;
    mockUseMembership.mockReturnValue(membership(p));
    renderIntl(<PartyLedger partyId="p1" />);
    await screen.findByText(party.name);
    expect(screen.getByText(tExp.ledger.you_gave_button)).toBeInTheDocument();
    expect(screen.getByText(tExp.ledger.you_got_button)).toBeInTheDocument();
    expect(screen.getByLabelText(tExp.party.edit_title)).toBeInTheDocument();

    // Open the edit dialog via the row; the delete affordance is hidden
    // because expenses.delete is NOT granted.
    fireEvent.click(screen.getByText(tExp.home.you_gave));
    await waitFor(() => expect(screen.getByText(tExp.entry.edit_title)).toBeInTheDocument());
    expect(screen.queryByText(en.common.action.delete)).not.toBeInTheDocument();
  });

  it('shows the entry delete affordance with expenses.delete', async () => {
    const p = withView('expenses');
    p.expenses.edit = true;
    p.expenses.delete = true;
    mockUseMembership.mockReturnValue(membership(p));
    renderIntl(<PartyLedger partyId="p1" />);
    await screen.findByText(party.name);
    fireEvent.click(screen.getByText(tExp.home.you_gave));
    await waitFor(() => expect(screen.getByText(tExp.entry.edit_title)).toBeInTheDocument());
    expect(screen.getByText(en.common.action.delete)).toBeInTheDocument();
  });
});

describe('ExpensesHome add-party gate', () => {
  it('hides the add-person FAB without expenses.manage_parties', async () => {
    mockUseMembership.mockReturnValue(membership(withView('expenses')));
    renderIntl(<ExpensesHome />);
    await screen.findByText(party.name);
    expect(screen.queryByLabelText(tExp.home.add_person)).not.toBeInTheDocument();
  });

  it('shows the add-person FAB for the owner', async () => {
    mockUseMembership.mockReturnValue(membership(emptyPermissions(), true));
    renderIntl(<ExpensesHome />);
    await screen.findByText(party.name);
    expect(screen.getByLabelText(tExp.home.add_person)).toBeInTheDocument();
  });
});

describe('CurrentStockList record-transaction gate', () => {
  it('hides the record-transaction FAB without inventory.create', async () => {
    mockUseMembership.mockReturnValue(membership(withView('inventory')));
    renderIntl(<CurrentStockList />);
    await waitFor(() =>
      expect(screen.queryByLabelText(en.common.state.loading)).not.toBeInTheDocument(),
    );
    expect(screen.queryByLabelText(en.inventory.stock.record_transaction)).not.toBeInTheDocument();
  });

  it('shows the record-transaction FAB with inventory.create', async () => {
    const p = withView('inventory');
    p.inventory.create = true;
    mockUseMembership.mockReturnValue(membership(p));
    renderIntl(<CurrentStockList />);
    await waitFor(() =>
      expect(screen.getByLabelText(en.inventory.stock.record_transaction)).toBeInTheDocument(),
    );
  });
});

function withView(module: 'expenses' | 'inventory'): MemberPermissions {
  const p = emptyPermissions();
  p[module].view = true;
  return p;
}
