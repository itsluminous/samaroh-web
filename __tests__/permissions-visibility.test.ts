/**
 * Section-visibility rules (§3): modules without `<module>.view` disappear
 * from the nav and the root redirect lands on the first visible section
 * (Menu when none). Degraded modes (no Supabase, loading, no session/
 * business) fail open — RLS protects the data and screens self-degrade.
 */
import { emptyPermissions, type MemberPermissions } from '@/lib/permissions/permissions';
import { resolveLandingHref } from '@/lib/permissions/landing';
import {
  canViewSection,
  firstVisibleSection,
  NAV_MODULES,
  type VisibilityInput,
} from '@/lib/permissions/visibility';

function member(permissions: MemberPermissions, overrides: Partial<VisibilityInput> = {}): VisibilityInput {
  return { supabase: {}, loading: false, error: null, isOwner: false, permissions, ...overrides };
}

describe('canViewSection', () => {
  it('maps <module>.view to nav visibility per module', () => {
    const p = emptyPermissions();
    p.expenses.view = true;
    const m = member(p);
    expect(canViewSection(m, 'booking')).toBe(false);
    expect(canViewSection(m, 'expenses')).toBe(true);
    expect(canViewSection(m, 'inventory')).toBe(false);
  });

  it('shows every module to the owner regardless of the blob', () => {
    const m = member(emptyPermissions(), { isOwner: true });
    for (const mod of NAV_MODULES) {
      expect(canViewSection(m, mod)).toBe(true);
    }
  });

  it('fails open while loading, without Supabase, and on membership errors', () => {
    const p = emptyPermissions();
    for (const overrides of [
      { loading: true },
      { supabase: null },
      { error: 'no session' },
      { error: 'no business' },
    ]) {
      const m = member(p, overrides);
      for (const mod of NAV_MODULES) {
        expect(canViewSection(m, mod)).toBe(true);
      }
    }
  });

  it('hides all three modules from a member with no view permissions', () => {
    const m = member(emptyPermissions());
    for (const mod of NAV_MODULES) {
      expect(canViewSection(m, mod)).toBe(false);
    }
  });
});

describe('firstVisibleSection', () => {
  it('lands on Booking for the owner (§4.1 home tab)', () => {
    expect(firstVisibleSection(emptyPermissions(), true)).toBe('/booking');
  });

  it('skips hidden Booking and lands on the first visible section', () => {
    const p = emptyPermissions();
    p.expenses.view = true;
    p.inventory.view = true;
    expect(firstVisibleSection(p, false)).toBe('/expenses');
  });

  it('lands on Inventory when only inventory.view is granted', () => {
    const p = emptyPermissions();
    p.inventory.view = true;
    expect(firstVisibleSection(p, false)).toBe('/inventory');
  });

  it('falls back to Menu when no module is viewable', () => {
    expect(firstVisibleSection(emptyPermissions(), false)).toBe('/menu');
  });
});

/** Minimal PostgREST-ish stub for the two membership queries. */
function fakeDb(options: {
  userId?: string | null;
  business?: { id: string; owner_user_id: string } | null;
  member?: { permissions: unknown; is_owner: boolean } | null;
}) {
  const rows = {
    businesses: options.business ? [options.business] : [],
    business_members: options.member ?? null,
  };
  const builder = (table: 'businesses' | 'business_members') => {
    const chain = {
      select: () => chain,
      is: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: () => Promise.resolve({ data: rows.business_members, error: null }),
      // Awaitable at any point in the chain (landing.ts ends on .order()).
      then: (resolve: (v: unknown) => unknown) => resolve({ data: rows.businesses, error: null }),
    };
    void table;
    return chain;
  };
  return {
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: options.userId ? { id: options.userId } : null },
          error: null,
        }),
    },
    from: builder,
  } as never;
}

describe('resolveLandingHref', () => {
  it('defaults to /booking without a Supabase client (unconfigured / guest)', async () => {
    expect(await resolveLandingHref(null)).toBe('/booking');
  });

  it('defaults to /booking without a session or business', async () => {
    expect(await resolveLandingHref(fakeDb({ userId: null }))).toBe('/booking');
    expect(await resolveLandingHref(fakeDb({ userId: 'u1', business: null }))).toBe('/booking');
  });

  it('lands the owner on /booking', async () => {
    const db = fakeDb({ userId: 'u1', business: { id: 'b1', owner_user_id: 'u1' } });
    expect(await resolveLandingHref(db)).toBe('/booking');
  });

  it('lands a member without booking.view on their first visible section', async () => {
    const db = fakeDb({
      userId: 'u2',
      business: { id: 'b1', owner_user_id: 'u1' },
      member: { is_owner: false, permissions: { expenses: { view: true } } },
    });
    expect(await resolveLandingHref(db)).toBe('/expenses');
  });

  it('lands a member with no view permissions on /menu', async () => {
    const db = fakeDb({
      userId: 'u2',
      business: { id: 'b1', owner_user_id: 'u1' },
      member: { is_owner: false, permissions: {} },
    });
    expect(await resolveLandingHref(db)).toBe('/menu');
  });
});
