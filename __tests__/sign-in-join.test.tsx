/**
 * SignInForm join path (§4.0 step 4): a signed-in user with no active
 * membership but a pending invitation gets the join step; accepting activates
 * the membership server-side (self-activation policy, shared migration 004)
 * and only a CONFIRMED activation enters the app. Supabase is a scripted fake.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '../messages/en.json';
import SignInForm from '@/components/SignInForm';
import { createRemoteClient } from '@/lib/supabase/client';

const pushMock = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => '/en/sign-in',
  useRouter: () => ({
    push: pushMock,
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

interface QueryResult {
  data: unknown;
  error: null;
}

/**
 * Thenable PostgREST-builder fake: each `from(table)` call consumes the next
 * scripted result for that table, whatever chain of filters follows. Records
 * update payloads for assertions.
 */
function fakeClient(script: Record<string, QueryResult[]>) {
  const updates: Array<{ table: string; values: unknown }> = [];
  const from = jest.fn((table: string) => {
    const result: QueryResult = script[table]?.shift() ?? { data: [], error: null };
    const builder: Record<string, unknown> = {};
    const chain = jest.fn(() => builder);
    for (const method of ['select', 'eq', 'is', 'limit', 'order']) {
      builder[method] = chain;
    }
    builder.update = jest.fn((values: unknown) => {
      updates.push({ table, values });
      return builder;
    });
    builder.maybeSingle = jest.fn(async () => {
      const rows = result.data as unknown[] | null;
      return { data: rows?.[0] ?? null, error: null };
    });
    builder.then = (resolve: (value: QueryResult) => unknown) =>
      Promise.resolve(result).then(resolve);
    return builder;
  });
  return {
    updates,
    auth: {
      signInWithPassword: jest.fn(async () => ({
        data: { user: { id: 'uid-1' } },
        error: null,
      })),
      signUp: jest.fn(),
      signInWithOAuth: jest.fn(),
    },
    from,
  };
}

const inviteRow = {
  id: 'member-1',
  business_id: 'biz-1',
  display_name: 'Prakash',
  businesses: { name: 'Sharma Palace' },
};

function renderForm() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SignInForm />
    </NextIntlClientProvider>,
  );
}

async function signIn() {
  fireEvent.change(screen.getByLabelText(new RegExp(en.auth.sign_in.email_label)), {
    target: { value: 'prakash@example.com' },
  });
  fireEvent.change(screen.getByLabelText(new RegExp(en.auth.sign_in.password_label)), {
    target: { value: 'secret123' },
  });
  fireEvent.click(screen.getByRole('button', { name: en.auth.sign_in.submit }));
}

describe('SignInForm join path', () => {
  beforeEach(() => {
    mockedCreateRemoteClient.mockReset();
    pushMock.mockReset();
  });

  it('shows the join step when a pending invitation exists', async () => {
    const client = fakeClient({
      business_members: [
        { data: [], error: null }, // active-membership check
        { data: [inviteRow], error: null }, // pending invites
      ],
      businesses: [{ data: [], error: null }], // owned-business check
    });
    mockedCreateRemoteClient.mockReturnValue(client);
    renderForm();
    await signIn();

    expect(await screen.findByRole('heading', { name: en.onboarding.join.title })).toBeInTheDocument();
    expect(screen.getByText('Sharma Palace')).toBeInTheDocument();
    expect(screen.getByText(en.onboarding.join.invited_as.replace('{name}', 'Prakash'))).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('activates the membership on accept and enters the app', async () => {
    const activated = { ...inviteRow, status: 'active', user_id: 'uid-1' };
    const client = fakeClient({
      business_members: [
        { data: [], error: null }, // active-membership check
        { data: [inviteRow], error: null }, // pending invites
        { data: [activated], error: null }, // the activation UPDATE
      ],
      businesses: [{ data: [], error: null }],
    });
    mockedCreateRemoteClient.mockReturnValue(client);
    renderForm();
    await signIn();
    fireEvent.click(await screen.findByRole('button', { name: en.onboarding.join.accept }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/en/booking'));
    expect(client.updates).toEqual([
      { table: 'business_members', values: { user_id: 'uid-1', status: 'active' } },
    ]);
  });

  it('stays on the join step with an error when the server refuses the activation', async () => {
    const client = fakeClient({
      business_members: [
        { data: [], error: null }, // active-membership check
        { data: [inviteRow], error: null }, // pending invites
        { data: [], error: null }, // UPDATE refused by RLS: 0 rows
        { data: [{ id: 'member-1', status: 'invited', user_id: null }], error: null }, // re-read
      ],
      businesses: [{ data: [], error: null }],
    });
    mockedCreateRemoteClient.mockReturnValue(client);
    renderForm();
    await signIn();
    fireEvent.click(await screen.findByRole('button', { name: en.onboarding.join.accept }));

    expect(await screen.findByText(en.onboarding.join.accept_failed)).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('skips the join step entirely for an active membership', async () => {
    const client = fakeClient({
      business_members: [{ data: [{ id: 'member-9' }], error: null }], // active membership
    });
    mockedCreateRemoteClient.mockReturnValue(client);
    renderForm();
    await signIn();

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/en/booking'));
    expect(screen.queryByRole('heading', { name: en.onboarding.join.title })).not.toBeInTheDocument();
  });
});
