/**
 * SignInForm sign-up mode: mode toggle, client-side password validation,
 * email-confirmation notice and the duplicate-email (empty identities)
 * response — Supabase is a scripted fake.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '../messages/en.json';
import SignInForm from '@/components/SignInForm';
import { createRemoteClient } from '@/lib/supabase/client';

jest.mock('next/navigation', () => ({
  usePathname: () => '/en/sign-in',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
  }),
  useParams: () => ({ locale: 'en' }),
  useSearchParams: () => new URLSearchParams(),
  redirect: jest.fn(),
}));

jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(() => null),
  createRemoteClient: jest.fn(() => null),
}));

const mockedCreateRemoteClient = createRemoteClient as jest.Mock;

function fakeAuthClient(signUpResult: unknown) {
  return {
    auth: {
      signUp: jest.fn(async () => signUpResult),
      signInWithPassword: jest.fn(),
      signInWithOAuth: jest.fn(),
    },
    from: jest.fn(),
  };
}

function renderForm() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SignInForm />
    </NextIntlClientProvider>,
  );
}

async function switchToSignUp() {
  fireEvent.click(screen.getByRole('button', { name: en.auth.mode.to_sign_up }));
  await screen.findByRole('heading', { name: en.auth.sign_up.title });
}

function fillCredentials(email: string, password: string) {
  fireEvent.change(screen.getByLabelText(new RegExp(en.auth.sign_in.email_label)), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText(new RegExp(en.auth.sign_in.password_label)), {
    target: { value: password },
  });
}

describe('SignInForm sign-up', () => {
  beforeEach(() => {
    mockedCreateRemoteClient.mockReset();
  });

  it('toggles between sign-in and sign-up modes', async () => {
    mockedCreateRemoteClient.mockReturnValue(fakeAuthClient({}));
    renderForm();

    expect(screen.getByRole('heading', { name: en.auth.sign_in.title })).toBeInTheDocument();
    await switchToSignUp();
    expect(screen.getByRole('button', { name: en.auth.sign_up.submit })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: en.auth.mode.to_sign_in }));
    expect(await screen.findByRole('heading', { name: en.auth.sign_in.title })).toBeInTheDocument();
  });

  it('rejects a short password client-side without calling the server', async () => {
    const client = fakeAuthClient({});
    mockedCreateRemoteClient.mockReturnValue(client);
    renderForm();
    await switchToSignUp();

    fillCredentials('someone@example.com', 'short');
    fireEvent.click(screen.getByRole('button', { name: en.auth.sign_up.submit }));

    expect(await screen.findByText(en.auth.sign_up.password_min)).toBeInTheDocument();
    expect(client.auth.signUp).not.toHaveBeenCalled();
  });

  it('shows the confirm-email notice when sign-up returns no session', async () => {
    const client = fakeAuthClient({
      data: { user: { id: 'u1', identities: [{ id: 'i1' }] }, session: null },
      error: null,
    });
    mockedCreateRemoteClient.mockReturnValue(client);
    renderForm();
    await switchToSignUp();

    fillCredentials('someone@example.com', 'longenough');
    fireEvent.click(screen.getByRole('button', { name: en.auth.sign_up.submit }));

    expect(await screen.findByText(en.auth.sign_up.confirm_email)).toBeInTheDocument();
    // Back in sign-in mode so the user can sign in after confirming.
    expect(screen.getByRole('heading', { name: en.auth.sign_in.title })).toBeInTheDocument();
  });

  it('flags an already-registered email (empty identities)', async () => {
    const client = fakeAuthClient({
      data: { user: { id: 'u1', identities: [] }, session: null },
      error: null,
    });
    mockedCreateRemoteClient.mockReturnValue(client);
    renderForm();
    await switchToSignUp();

    fillCredentials('taken@example.com', 'longenough');
    fireEvent.click(screen.getByRole('button', { name: en.auth.sign_up.submit }));

    expect(await screen.findByText(en.auth.sign_up.exists)).toBeInTheDocument();
  });

  it('keeps the guest entry enabled when Supabase is not configured', async () => {
    mockedCreateRemoteClient.mockReturnValue(null);
    renderForm();

    await waitFor(() =>
      expect(screen.getByText(en.auth.sign_in.not_configured)).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: en.auth.sign_in.submit })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: en.onboarding.sign_in.continue_offline }),
    ).toBeEnabled();
  });
});
