/**
 * Menu identity row (owner feedback: show who is signed in): renders the
 * session email under the localized "Signed in as" label, and the localized
 * "Not signed in" state in guest mode or without a session.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '../messages/en.json';
import hi from '../messages/hi.json';
import MenuIdentityRow from '@/app/[locale]/(app)/menu/_components/MenuIdentityRow';
import { isGuestMode } from '@/lib/guest/guest';
import { createRemoteClient } from '@/lib/supabase/client';

jest.mock('@/lib/guest/guest', () => ({
  isGuestMode: jest.fn(() => false),
}));

jest.mock('@/lib/supabase/client', () => ({
  createRemoteClient: jest.fn(() => null),
  createClient: jest.fn(() => null),
}));

const mockIsGuestMode = isGuestMode as jest.Mock;
const mockCreateRemoteClient = createRemoteClient as jest.Mock;

function clientWithUser(user: { email?: string } | null) {
  return {
    auth: {
      getUser: jest.fn(async () => ({ data: { user }, error: null })),
    },
  };
}

type Messages = typeof en;

function renderRow(locale = 'en', messages: Messages = en) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <MenuIdentityRow />
    </NextIntlClientProvider>,
  );
}

describe('MenuIdentityRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsGuestMode.mockReturnValue(false);
    mockCreateRemoteClient.mockReturnValue(null);
  });

  it('shows the signed-in email under the localized label', async () => {
    mockCreateRemoteClient.mockReturnValue(clientWithUser({ email: 'owner@example.com' }));
    renderRow();

    expect(await screen.findByText('owner@example.com')).toBeInTheDocument();
    expect(screen.getByText(en.menu.identity.signed_in_as)).toBeInTheDocument();
    expect(screen.queryByText(en.menu.identity.not_signed_in)).not.toBeInTheDocument();
  });

  it('shows the localized label in Hindi', async () => {
    mockCreateRemoteClient.mockReturnValue(clientWithUser({ email: 'owner@example.com' }));
    renderRow('hi', hi as Messages);

    expect(await screen.findByText('owner@example.com')).toBeInTheDocument();
    expect(screen.getByText(hi.menu.identity.signed_in_as)).toBeInTheDocument();
  });

  it('shows the not-signed-in state in guest mode without touching Supabase', async () => {
    mockIsGuestMode.mockReturnValue(true);
    renderRow();

    expect(await screen.findByText(en.menu.identity.not_signed_in)).toBeInTheDocument();
    expect(mockCreateRemoteClient).not.toHaveBeenCalled();
  });

  it('shows the not-signed-in state when there is no session', async () => {
    mockCreateRemoteClient.mockReturnValue(clientWithUser(null));
    renderRow();

    expect(await screen.findByText(en.menu.identity.not_signed_in)).toBeInTheDocument();
  });

  it('shows the not-signed-in state when Supabase is not configured', async () => {
    mockCreateRemoteClient.mockReturnValue(null);
    renderRow();

    expect(await screen.findByText(en.menu.identity.not_signed_in)).toBeInTheDocument();
  });

  it('signed in: the sign-out icon opens the confirmation dialog (ADR-040)', async () => {
    mockCreateRemoteClient.mockReturnValue(clientWithUser({ email: 'owner@example.com' }));
    renderRow();
    await screen.findByText('owner@example.com');

    fireEvent.click(screen.getByRole('button', { name: en.menu.identity.sign_out }));
    expect(screen.getByText(en.menu.sign_out.confirm_title)).toBeInTheDocument();
    expect(screen.getByText(en.menu.sign_out.confirm_message)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.menu.sign_out.confirm_action })).toBeInTheDocument();
  });

  it('not signed in: no sign-out icon', async () => {
    mockCreateRemoteClient.mockReturnValue(clientWithUser(null));
    renderRow();

    await screen.findByText(en.menu.identity.not_signed_in);
    expect(screen.queryByRole('button', { name: en.menu.identity.sign_out })).not.toBeInTheDocument();
  });
});
