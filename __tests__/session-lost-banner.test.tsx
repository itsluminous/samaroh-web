/**
 * SessionLostBanner (Android ADR-089 parity): a signed-in tab that loses its
 * Supabase session shows a localized "signed out — sign in" banner (both
 * locales); guest mode never shows it; a returning session hides it again.
 */
import { act, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '../messages/en.json';
import hi from '../messages/hi.json';
import SessionLostBanner from '@/components/SessionLostBanner';

type AuthListener = (event: string, session: object | null) => void;

let listener: AuthListener | null = null;
let initialSession: object | null = { user: { id: 'u1' } };
const mockIsGuestMode = jest.fn(() => false);
const mockReplay = jest.fn(() => Promise.resolve());

jest.mock('@/lib/guest/guest', () => ({
  isGuestMode: () => mockIsGuestMode(),
}));
jest.mock('@/lib/outbox/outbox', () => ({
  replayOutbox: () => mockReplay(),
}));
jest.mock('@/lib/supabase/client', () => ({
  createRemoteClient: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session: initialSession } }),
      onAuthStateChange: (cb: AuthListener) => {
        listener = cb;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
    },
  }),
}));
jest.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

type Messages = typeof en;

function renderBanner(locale: 'en' | 'hi', messages: Messages) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <SessionLostBanner />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  listener = null;
  initialSession = { user: { id: 'u1' } };
  mockIsGuestMode.mockReturnValue(false);
  mockReplay.mockClear();
});

describe.each([
  ['en', en],
  ['hi', hi],
] as const)('SessionLostBanner (%s)', (locale, messages) => {
  test('hidden while the session is alive, shown on SIGNED_OUT with the sign-in CTA', async () => {
    renderBanner(locale, messages);
    await act(async () => {});
    expect(screen.queryByRole('alert')).toBeNull();

    await act(async () => {
      listener?.('SIGNED_OUT', null);
    });

    expect(screen.getByRole('alert')).toHaveTextContent(messages.auth.session_lost.banner);
    const cta = screen.getByRole('link', { name: messages.auth.session_lost.sign_in });
    expect(cta).toHaveAttribute('href', '/sign-in');
  });

  test('a returning session hides the banner and replays the held queue', async () => {
    renderBanner(locale, messages);
    await act(async () => {
      listener?.('SIGNED_OUT', null);
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await act(async () => {
      listener?.('SIGNED_IN', { user: { id: 'u1' } });
    });

    expect(screen.queryByRole('alert')).toBeNull();
    expect(mockReplay).toHaveBeenCalledTimes(1);
  });
});

test('a tab restored without any session shows the banner immediately', async () => {
  initialSession = null;
  renderBanner('en', en);
  await act(async () => {});
  expect(screen.getByRole('alert')).toBeInTheDocument();
});

test('guest mode never shows the banner', async () => {
  mockIsGuestMode.mockReturnValue(true);
  initialSession = null;
  renderBanner('en', en);
  await act(async () => {});
  expect(screen.queryByRole('alert')).toBeNull();
  expect(listener).toBeNull();
});
