/**
 * Amounts-visibility masking (per-module `view_amounts`, absent = TRUE):
 * every financial figure renders as the ₹••• mask (with the "Amount hidden"
 * a11y label) when the module's view_amounts is explicitly false —
 * booking summary/detail/payment history (+ invoice button hidden), expenses
 * totals/balances/entry amounts, inventory values (quantities stay), and the
 * reports home hides money reports (occupancy/collection stay). Plus the
 * permission-matrix editor's per-module "View amounts" toggle round-trip.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import theme from '@/theme/theme';
import en from '../messages/en.json';
import BookingDetail from '@/app/[locale]/(app)/booking/components/BookingDetail';
import SummaryCard from '@/app/[locale]/(app)/booking/components/SummaryCard';
import ExpensesHome from '@/app/[locale]/(app)/expenses/_components/ExpensesHome';
import PartyLedger from '@/app/[locale]/(app)/expenses/_components/PartyLedger';
import CurrentStockList from '@/app/[locale]/(app)/inventory/_components/CurrentStockList';
import ReportsHome from '@/app/[locale]/(app)/menu/_components/ReportsHome';
import PermissionMatrixEditor from '@/app/[locale]/(app)/menu/_components/PermissionMatrixEditor';
import { AMOUNT_MASK } from '@/components/MaskedAmount';
import type { Booking, BookingPayment, Business } from '@/lib/booking/types';
import { OWNER_PERMISSIONS } from '@/lib/booking/types';
import type { MemberPermissions } from '@/lib/permissions/permissions';
import { hasPerm, normalizePermissions } from '@/lib/permissions/permissions';
import { NON_MONEY_REPORT_KEYS, REPORT_KEYS } from '@/lib/reports/types';

const mockUseMembership = jest.fn();
jest.mock('@/lib/permissions/useMembership', () => ({
  useMembership: () => mockUseMembership(),
}));

jest.mock('@/lib/hooks/useBusiness', () => ({
  useBusiness: () => ({
    supabase: {},
    businessId: 'b1',
    businessName: 'Biz',
    userId: 'u1',
    loading: false,
    error: null,
  }),
}));

jest.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  Link: ({ children, ...props }: { children: ReactNode; href: string }) => <a {...props}>{children}</a>,
}));

const party = { id: 'p1', name: 'Tent House', phone: null, business_related: true, updated_at: '2026-01-01T00:00:00Z' };
const expense = {
  id: 'e1',
  party_id: 'p1',
  direction: 'paid' as const,
  amount: 777,
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

const stockRow = {
  masterItemId: 'i1',
  name: 'Chairs',
  unit: 'pcs',
  imagePath: null,
  currentQuantity: 250,
  currentValue: 12500,
  lastTransactionAt: null,
};

jest.mock('@/app/[locale]/(app)/inventory/_lib/queries', () => ({
  fetchCurrentInventory: jest.fn(() => Promise.resolve([stockRow])),
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

/** Member permissions with `module.view` granted, optionally amounts hidden. */
function memberPerms(overrides: Record<string, Record<string, boolean>>): MemberPermissions {
  return normalizePermissions(overrides);
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

const A11Y_HIDDEN = en.auth.permissions.amount_hidden_a11y;

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

const booking: Booking = {
  id: 'bk1',
  business_id: 'b1',
  event_type: 'wedding',
  event_icon: '💍',
  customer_name: 'Asha',
  customer_phone: null,
  start_date: '2026-09-01',
  end_date: '2026-09-01',
  start_time: null,
  end_time: null,
  total_amount: 106511,
  security_deposit: 0,
  source: null,
  notes: null,
  status: 'confirmed',
  color: null,
  invoice_number: null,
  created_by: 'member-2',
  updated_by: null,
  created_at: '2026-08-01T10:00:00Z',
  updated_at: '2026-08-01T10:00:00Z',
  deleted_at: null,
};

const payment: BookingPayment = {
  id: 'pay1',
  booking_id: 'bk1',
  business_id: 'b1',
  amount: 40000,
  paid_on: '2026-08-02',
  method: 'upi',
  notes: null,
  created_by: 'member-2',
  created_at: '2026-08-02T10:00:00Z',
  deleted_at: null,
};

const business: Business = {
  id: 'b1',
  name: 'Biz Palace',
  business_type: 'banquet_hall',
  address: null,
  owner_name: 'Owner Om',
  logo_path: null,
  invoice_prefix: 'INV',
  invoice_counter: 1,
  owner_user_id: 'owner-1',
};

function renderBookingDetail(viewAmounts: boolean) {
  return renderIntl(
    <BookingDetail
      booking={booking}
      payments={[payment]}
      business={business}
      memberNames={{ 'member-2': 'Meera', 'owner-1': 'Owner Om' }}
      permissions={{ ...OWNER_PERMISSIONS, view_amounts: viewAmounts }}
      onClose={jest.fn()}
      onEdit={jest.fn()}
      onRecordPayment={jest.fn()}
      onCancelBooking={jest.fn()}
      onInvoicePdf={jest.fn()}
      onInvoiceText={jest.fn()}
      invoiceBusy={false}
    />,
  );
}

describe('booking masking (booking.view_amounts)', () => {
  it('summary card masks received/pending when showAmounts=false', () => {
    renderIntl(<SummaryCard received={106511} pending={50000} showAmounts={false} />);
    expect(screen.getByText(`Received ${AMOUNT_MASK}`)).toBeInTheDocument();
    expect(screen.getByText(`Pending ${AMOUNT_MASK}`)).toBeInTheDocument();
    expect(screen.queryByText(/1,06,511/)).not.toBeInTheDocument();
  });

  it('summary card shows amounts when showAmounts=true', () => {
    renderIntl(<SummaryCard received={106511} pending={50000} showAmounts />);
    expect(screen.getByText('Received \u20B91,06,511')).toBeInTheDocument();
  });

  it('detail masks total/paid/due + payment history and hides the invoice button', () => {
    renderBookingDetail(false);
    // No real figures anywhere in the drawer.
    expect(screen.queryByText(/1,06,511/)).not.toBeInTheDocument();
    expect(screen.queryByText(/40,000/)).not.toBeInTheDocument();
    // Masks carry the screen-reader label: total, paid, due, 1 payment row.
    expect(screen.getAllByText(A11Y_HIDDEN).length).toBeGreaterThanOrEqual(4);
    // Invoice affordance is hidden — an invoice IS the amounts.
    expect(screen.queryByText(en.booking.card.action_invoice)).not.toBeInTheDocument();
  });

  it('detail shows amounts and the invoice button when view_amounts=true', () => {
    renderBookingDetail(true);
    expect(screen.getByText('\u20B91,06,511')).toBeInTheDocument();
    // Paid row + the payment-history entry.
    expect(screen.getAllByText('\u20B940,000')).toHaveLength(2);
    expect(screen.getByText(en.booking.card.action_invoice)).toBeInTheDocument();
    expect(screen.queryByText(A11Y_HIDDEN)).not.toBeInTheDocument();
  });

  it('detail resolves the audit line from created_by, not the session/owner', () => {
    renderBookingDetail(true);
    expect(screen.getByText(/Added by Meera on/)).toBeInTheDocument();
    expect(screen.queryByText(/Added by Owner Om/)).not.toBeInTheDocument();
  });

  it('an unknown creator uses the neutral fallback, never another name', () => {
    renderIntl(
      <BookingDetail
        booking={booking}
        payments={[payment]}
        business={business}
        memberNames={{}}
        permissions={{ ...OWNER_PERMISSIONS, view_amounts: true }}
        onClose={jest.fn()}
        onEdit={jest.fn()}
        onRecordPayment={jest.fn()}
        onCancelBooking={jest.fn()}
        onInvoicePdf={jest.fn()}
        onInvoiceText={jest.fn()}
        invoiceBusy={false}
      />,
    );
    expect(
      screen.getByText(new RegExp(`Added by ${en.booking.card.audit_added_unknown_member} on`)),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Added by Owner Om/)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

describe('expenses masking (expenses.view_amounts)', () => {
  it('home masks you-gave/you-got totals and party balances', async () => {
    mockUseMembership.mockReturnValue(
      membership(memberPerms({ expenses: { view: true, view_amounts: false } })),
    );
    renderIntl(<ExpensesHome />);
    await screen.findByText(party.name);
    expect(screen.queryByText(/777/)).not.toBeInTheDocument();
    // gave total + got total + 1 party net balance = 3 masks.
    expect(screen.getAllByText(A11Y_HIDDEN)).toHaveLength(3);
  });

  it('home shows totals with view_amounts granted (absent = true)', async () => {
    mockUseMembership.mockReturnValue(membership(memberPerms({ expenses: { view: true } })));
    renderIntl(<ExpensesHome />);
    await screen.findByText(party.name);
    expect(screen.getAllByText('\u20B9777').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(A11Y_HIDDEN)).not.toBeInTheDocument();
  });

  it('ledger masks the net balance, running balance chip and entry amounts', async () => {
    mockUseMembership.mockReturnValue(
      membership(memberPerms({ expenses: { view: true, view_amounts: false } })),
    );
    renderIntl(<PartyLedger partyId="p1" />);
    await screen.findByText(party.name);
    expect(screen.queryByText(/777/)).not.toBeInTheDocument();
    // Balance chip interpolates the string mask.
    expect(screen.getByText(`Balance: ${AMOUNT_MASK}`)).toBeInTheDocument();
    // Header net balance + entry amount masks with a11y labels.
    expect(screen.getAllByText(A11Y_HIDDEN).length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

describe('inventory masking (inventory.view_amounts)', () => {
  it('stock list masks item values but keeps quantities visible', async () => {
    mockUseMembership.mockReturnValue(
      membership(memberPerms({ inventory: { view: true, view_amounts: false } })),
    );
    renderIntl(<CurrentStockList />);
    await screen.findByText(stockRow.name);
    expect(screen.queryByText(/12,500/)).not.toBeInTheDocument();
    expect(screen.getAllByText(A11Y_HIDDEN)).toHaveLength(1);
    // Quantity (250 pcs) stays visible.
    expect(screen.getByText(/250/)).toBeInTheDocument();
  });

  it('stock list shows values with view_amounts granted', async () => {
    mockUseMembership.mockReturnValue(membership(memberPerms({ inventory: { view: true } })));
    renderIntl(<CurrentStockList />);
    await screen.findByText(stockRow.name);
    expect(screen.getByText('\u20B912,500')).toBeInTheDocument();
    expect(screen.queryByText(A11Y_HIDDEN)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Reports home filtering
// ---------------------------------------------------------------------------

describe('reports home filtering (reports.view_amounts)', () => {
  it('hides money reports; occupancy and collection stay', async () => {
    mockUseMembership.mockReturnValue(
      membership(memberPerms({ reports: { view: true, view_amounts: false } })),
    );
    renderIntl(<ReportsHome />);
    await screen.findByText(en.reports.home.title);
    for (const key of NON_MONEY_REPORT_KEYS) {
      expect(screen.getByText(en.reports.report[key])).toBeInTheDocument();
    }
    for (const key of REPORT_KEYS.filter((k) => !(NON_MONEY_REPORT_KEYS as readonly string[]).includes(k))) {
      expect(screen.queryByText(en.reports.report[key])).not.toBeInTheDocument();
    }
  });

  it('lists all 10 reports when view_amounts is granted (absent = true)', async () => {
    mockUseMembership.mockReturnValue(membership(memberPerms({ reports: { view: true } })));
    renderIntl(<ReportsHome />);
    await screen.findByText(en.reports.home.title);
    for (const key of REPORT_KEYS) {
      expect(screen.getByText(en.reports.report[key])).toBeInTheDocument();
    }
  });
});

// ---------------------------------------------------------------------------
// Matrix editor round-trip
// ---------------------------------------------------------------------------

describe('permission matrix editor — View amounts toggles', () => {
  it('renders one per-module toggle for booking/expenses/inventory/reports, on by default', () => {
    renderIntl(<PermissionMatrixEditor value={normalizePermissions({})} onChange={jest.fn()} />);
    const toggles = screen.getAllByLabelText(en.auth.permissions.action_view_amounts);
    expect(toggles).toHaveLength(4);
    for (const toggle of toggles) {
      expect(toggle).toBeChecked();
    }
  });

  it('toggle off → onChange carries view_amounts=false and survives a save/normalize round-trip', async () => {
    const onChange = jest.fn();
    renderIntl(<PermissionMatrixEditor value={normalizePermissions({})} onChange={onChange} />);
    // First "View amounts" switch is the Booking group's (matrix display order).
    const bookingGroup = screen.getByText(en.auth.permissions.group_booking).parentElement!;
    const toggle = within(bookingGroup).getByLabelText(en.auth.permissions.action_view_amounts);
    fireEvent.click(toggle);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const next = onChange.mock.calls[0][0] as MemberPermissions;
    expect(next.booking.view_amounts).toBe(false);
    expect(next.expenses.view_amounts).toBe(true);
    // Round trip: serialize (as MembersScreen saves the jsonb) → normalize.
    const roundTripped = normalizePermissions(JSON.parse(JSON.stringify(next)));
    expect(hasPerm(roundTripped, 'booking', 'view_amounts')).toBe(false);
    expect(hasPerm(roundTripped, 'expenses', 'view_amounts')).toBe(true);
    expect(roundTripped).toEqual(next);
  });
});
