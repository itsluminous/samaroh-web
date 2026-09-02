/**
 * Member management surfacing (owner report: "web has no member management"):
 * the Members entry IS routed at /menu/members and linked from Menu home — the
 * fragile part was the isOwner gate. These tests pin the gate itself
 * (MenuHome) and the hardened resolution in useMembership: local-session-first
 * (no auth-server round trip that silently hides the row on flaky networks)
 * and owned-business preference when the user belongs to several businesses.
 */
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import en from '../messages/en.json';
import MenuHome from '@/app/[locale]/(app)/menu/_components/MenuHome';
import { useMembership } from '@/lib/permissions/useMembership';
import { createClient } from '@/lib/supabase/client';

jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(() => null),
}));

jest.mock('@/i18n/navigation', () => ({
  // eslint-disable-next-line react/jsx-no-literals -- test stub anchor
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

// MenuIdentityRow has its own client wiring (covered by menu-identity tests).
jest.mock('@/app/[locale]/(app)/menu/_components/MenuIdentityRow', () => ({
  __esModule: true,
  default: () => null,
}));

const mockCreateClient = createClient as jest.Mock;

interface BizRow {
  id: string;
  owner_user_id: string;
  name?: string;
}

/**
 * Minimal awaitable query-builder stub: every filter/order call chains, and
 * awaiting resolves the canned result for the table.
 */
function stubClient({
  sessionUserId,
  getUserId,
  businesses,
  memberRow,
}: {
  sessionUserId: string | null;
  getUserId?: string | null;
  businesses: BizRow[];
  memberRow?: { permissions: unknown; is_owner: boolean } | null;
}) {
  const getUser = jest.fn(async () =>
    getUserId
      ? { data: { user: { id: getUserId } }, error: null }
      : { data: { user: null }, error: { message: 'no session' } },
  );
  const builder = (result: unknown) => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'order', 'limit']) {
      chain[m] = jest.fn(() => chain);
    }
    chain['maybeSingle'] = jest.fn(async () => ({ data: memberRow ?? null, error: null }));
    chain['then'] = (resolve: (v: unknown) => unknown) => resolve({ data: result, error: null });
    return chain;
  };
  return {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: sessionUserId ? { user: { id: sessionUserId } } : null },
        error: null,
      })),
      getUser,
    },
    from: jest.fn((table: string) => builder(table === 'businesses' ? businesses : [])),
    _getUser: getUser,
  };
}

function renderMenu() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <MenuHome title={en.menu.home.title} />
    </NextIntlClientProvider>,
  );
}

describe('MenuHome members row gate', () => {
  beforeEach(() => jest.clearAllMocks());

  it('the owner sees the Members entry (linked to /menu/members)', async () => {
    mockCreateClient.mockReturnValue(
      stubClient({
        sessionUserId: 'owner-1',
        businesses: [{ id: 'biz-1', owner_user_id: 'owner-1' }],
      }),
    );
    renderMenu();

    const members = await screen.findByText(en.menu.section.members);
    expect(members).toBeInTheDocument();
    expect(members.closest('a')).toHaveAttribute('href', '/menu/members');
  });

  it('a non-owner member does not see the Members entry', async () => {
    mockCreateClient.mockReturnValue(
      stubClient({
        sessionUserId: 'employee-1',
        businesses: [{ id: 'biz-1', owner_user_id: 'owner-1' }],
        memberRow: { permissions: {}, is_owner: false },
      }),
    );
    renderMenu();

    await screen.findByText(en.menu.section.settings);
    expect(screen.queryByText(en.menu.section.members)).not.toBeInTheDocument();
  });
});

describe('useMembership resolution', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolves from the local session without an auth-server round trip', async () => {
    const client = stubClient({
      sessionUserId: 'owner-1',
      businesses: [{ id: 'biz-1', owner_user_id: 'owner-1' }],
    });
    mockCreateClient.mockReturnValue(client);

    const { result } = renderHook(() => useMembership());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isOwner).toBe(true);
    expect(client._getUser).not.toHaveBeenCalled();
  });

  it('falls back to getUser when there is no session (guest local client)', async () => {
    const client = stubClient({
      sessionUserId: null,
      getUserId: 'guest-1',
      businesses: [{ id: 'biz-g', owner_user_id: 'guest-1' }],
    });
    mockCreateClient.mockReturnValue(client);

    const { result } = renderHook(() => useMembership());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isOwner).toBe(true);
    expect(client._getUser).toHaveBeenCalled();
  });

  it('prefers the business the user OWNS over an earlier-created membership', async () => {
    const client = stubClient({
      sessionUserId: 'owner-1',
      businesses: [
        { id: 'biz-other', owner_user_id: 'someone-else' }, // created first
        { id: 'biz-own', owner_user_id: 'owner-1' },
      ],
    });
    mockCreateClient.mockReturnValue(client);

    const { result } = renderHook(() => useMembership());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.business?.id).toBe('biz-own');
    expect(result.current.isOwner).toBe(true);
  });

  it('non-owner membership resolves permissions from business_members', async () => {
    const client = stubClient({
      sessionUserId: 'employee-1',
      businesses: [{ id: 'biz-1', owner_user_id: 'owner-1' }],
      memberRow: { permissions: { booking: { view: true } }, is_owner: false },
    });
    mockCreateClient.mockReturnValue(client);

    const { result } = renderHook(() => useMembership());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isOwner).toBe(false);
    expect(result.current.permissions.booking.view).toBe(true);
    expect(result.current.permissions.booking.create).toBe(false);
  });
});
