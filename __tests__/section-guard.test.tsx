/**
 * Route-guard behavior (§3): direct-URL access to a section the member
 * cannot view renders the localized no-access state (never a crash), owners
 * and permitted members see the screen, and degraded modes fail open.
 */
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '../messages/en.json';
import hi from '../messages/hi.json';
import SectionGuard from '@/components/SectionGuard';
import { emptyPermissions } from '@/lib/permissions/permissions';

const mockUseMembership = jest.fn();
jest.mock('@/lib/permissions/useMembership', () => ({
  useMembership: () => mockUseMembership(),
}));

type Messages = typeof en;

function membership(overrides: Record<string, unknown> = {}) {
  return {
    supabase: {},
    business: { id: 'b1' },
    userId: 'u1',
    isOwner: false,
    permissions: emptyPermissions(),
    loading: false,
    error: null,
    refresh: jest.fn(),
    ...overrides,
  };
}

function renderGuard(messages: Messages = en, locale = 'en') {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <SectionGuard module="booking">
        <div data-testid="section-content" />
      </SectionGuard>
    </NextIntlClientProvider>,
  );
}

describe('SectionGuard', () => {
  it('shows the localized no-access state without <module>.view (en + hi)', () => {
    mockUseMembership.mockReturnValue(membership());
    const { unmount } = renderGuard(en, 'en');
    expect(screen.queryByTestId('section-content')).not.toBeInTheDocument();
    expect(screen.getByText(en.common.permission.no_access_title)).toBeInTheDocument();
    expect(screen.getByText(en.common.permission.no_access_message)).toBeInTheDocument();
    unmount();

    renderGuard(hi as Messages, 'hi');
    expect(screen.getByText(hi.common.permission.no_access_title)).toBeInTheDocument();
  });

  it('renders the section for a member with view permission', () => {
    const perms = emptyPermissions();
    perms.booking.view = true;
    mockUseMembership.mockReturnValue(membership({ permissions: perms }));
    renderGuard();
    expect(screen.getByTestId('section-content')).toBeInTheDocument();
  });

  it('renders the section for the owner', () => {
    mockUseMembership.mockReturnValue(membership({ isOwner: true }));
    renderGuard();
    expect(screen.getByTestId('section-content')).toBeInTheDocument();
  });

  it('fails open when Supabase is unconfigured or membership errors', () => {
    mockUseMembership.mockReturnValue(membership({ supabase: null, loading: false }));
    const { unmount } = renderGuard();
    expect(screen.getByTestId('section-content')).toBeInTheDocument();
    unmount();

    mockUseMembership.mockReturnValue(membership({ error: 'no session' }));
    renderGuard();
    expect(screen.getByTestId('section-content')).toBeInTheDocument();
  });

  it('shows a loading state (not the section) while membership resolves', () => {
    mockUseMembership.mockReturnValue(membership({ loading: true }));
    renderGuard();
    expect(screen.queryByTestId('section-content')).not.toBeInTheDocument();
    expect(screen.getByLabelText(en.common.state.loading)).toBeInTheDocument();
  });
});
