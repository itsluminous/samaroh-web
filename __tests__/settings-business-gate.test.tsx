/**
 * Settings write-surface gates (§3, Android parity):
 *   - Business profile: owner / settings.manage_business get the EDITOR
 *     (form + save); every other member gets the READ-ONLY display — same
 *     info, no save button, no logo-edit hint (hidden, not disabled).
 *   - Event-types row: hidden without the manage gate; direct URL to the
 *     event-types screen shows the localized no-access state, not a blank
 *     page.
 */
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { NextIntlClientProvider } from 'next-intl';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import theme from '@/theme/theme';
import en from '../messages/en.json';
import EventTypesScreen from '@/app/[locale]/(app)/menu/_components/EventTypesScreen';
import SettingsScreen from '@/app/[locale]/(app)/menu/_components/SettingsScreen';
import { emptyPermissions, type MemberPermissions } from '@/lib/permissions/permissions';

const mockUseMembership = jest.fn();
jest.mock('@/lib/permissions/useMembership', () => ({
  useMembership: () => mockUseMembership(),
}));

jest.mock('@/lib/outbox/useOutbox', () => ({
  useOutbox: () => ({ pendingCount: 0, syncing: false }),
}));

jest.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children?: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/menu/settings',
}));

jest.mock('@/lib/booking/eventTypePresets', () => ({
  ...jest.requireActual('@/lib/booking/eventTypePresets'),
  fetchEventTypes: jest.fn(() => Promise.resolve([])),
}));

const business = {
  id: 'b1',
  name: 'Sharma Palace',
  business_type: 'Banquet hall',
  address: '12 MG Road',
  owner_name: 'Ramesh Sharma',
  logo_path: null,
  invoice_prefix: 'SP',
  owner_user_id: 'owner-1',
};

function membership(permissions: MemberPermissions, isOwner = false) {
  return {
    supabase: {
      storage: {
        from: () => ({ download: async () => ({ data: null, error: { message: 'unavailable' } }) }),
      },
    },
    business,
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

const tBiz = en.settings.business;

describe('SettingsScreen business profile gate', () => {
  it('viewer (no manage_business) gets the read-only display: values visible, no form/save/logo hint', () => {
    mockUseMembership.mockReturnValue(membership(emptyPermissions()));
    renderIntl(<SettingsScreen />);

    // Card and values are visible…
    expect(screen.getByText(tBiz.title)).toBeInTheDocument();
    expect(screen.getByText(business.name)).toBeInTheDocument();
    expect(screen.getByText(business.address)).toBeInTheDocument();
    // Invoice prefix appears as a labelled value ('SP' also shows as the
    // logo-avatar initials fallback, hence getAllByText).
    expect(screen.getByText(tBiz.invoice_prefix)).toBeInTheDocument();
    expect(screen.getAllByText(business.invoice_prefix).length).toBeGreaterThan(0);
    // …but no write affordances: no save button, no editable fields, no
    // logo-edit hint.
    expect(screen.queryByRole('button', { name: en.common.action.save })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText(tBiz.logo_mobile_hint)).not.toBeInTheDocument();
    // Event-types row is hidden too (manage_business gate).
    expect(screen.queryByText(en.settings.event_types.title)).not.toBeInTheDocument();
  });

  it('member with settings.manage_business gets the editor and the event-types row', () => {
    const p = emptyPermissions();
    p.settings.manage_business = true;
    mockUseMembership.mockReturnValue(membership(p));
    renderIntl(<SettingsScreen />);

    expect(screen.getByRole('button', { name: en.common.action.save })).toBeInTheDocument();
    expect(screen.getByDisplayValue(business.name)).toBeInTheDocument();
    expect(screen.getByText(tBiz.logo_mobile_hint)).toBeInTheDocument();
    expect(screen.getByText(en.settings.event_types.title)).toBeInTheDocument();
  });

  it('owner gets the editor regardless of the permissions object', () => {
    mockUseMembership.mockReturnValue(membership(emptyPermissions(), true));
    renderIntl(<SettingsScreen />);

    expect(screen.getByRole('button', { name: en.common.action.save })).toBeInTheDocument();
    expect(screen.getByDisplayValue(business.invoice_prefix)).toBeInTheDocument();
  });

  it('read-only display skips empty optional fields', () => {
    mockUseMembership.mockReturnValue({
      ...membership(emptyPermissions()),
      business: { ...business, address: null, business_type: '' },
    });
    renderIntl(<SettingsScreen />);

    expect(screen.getByText(business.name)).toBeInTheDocument();
    expect(screen.queryByText(tBiz.address)).not.toBeInTheDocument();
    expect(screen.queryByText(tBiz.type)).not.toBeInTheDocument();
  });
});

describe('EventTypesScreen direct-URL gate', () => {
  it('renders the localized no-access state (not a blank page) without the manage gate', async () => {
    mockUseMembership.mockReturnValue(membership(emptyPermissions()));
    renderIntl(<EventTypesScreen />);

    expect(await screen.findByText(en.common.permission.no_access_title)).toBeInTheDocument();
    expect(screen.getByText(en.common.permission.no_access_message)).toBeInTheDocument();
  });

  it('renders the manage UI with settings.manage_business', async () => {
    const p = emptyPermissions();
    p.settings.manage_business = true;
    mockUseMembership.mockReturnValue(membership(p));
    renderIntl(<EventTypesScreen />);

    expect(await screen.findByText(en.settings.event_types.empty)).toBeInTheDocument();
    expect(screen.queryByText(en.common.permission.no_access_title)).not.toBeInTheDocument();
  });
});
