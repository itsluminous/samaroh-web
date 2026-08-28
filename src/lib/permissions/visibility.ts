/**
 * Section (module) visibility rules for the app chrome (§3 permissions).
 *
 * A module is hidden from the left rail / bottom nav — and its routes show
 * the localized no-access state — only when membership has POSITIVELY
 * resolved to a non-owner whose permissions lack `<module>.view`. Every
 * degraded mode fails open for the chrome (Supabase unconfigured, guest
 * mode, no session, membership still loading): data stays protected by RLS,
 * and those modes render their own empty states.
 */
import type { MemberPermissions } from './permissions';

/** The three permission-gated nav sections; Menu is always visible. */
export const NAV_MODULES = ['booking', 'expenses', 'inventory'] as const;
export type NavModule = (typeof NAV_MODULES)[number];

/** The membership facts visibility depends on (subset of `Membership`). */
export interface VisibilityInput {
  /** null = Supabase unconfigured or guest-degraded — fail open. */
  supabase: unknown | null;
  loading: boolean;
  /** 'no session' / 'no business' etc. — fail open (screens self-handle). */
  error: string | null;
  isOwner: boolean;
  permissions: MemberPermissions;
}

/** True when `module`'s nav entry (and its routes) should be visible. */
export function canViewSection(m: VisibilityInput, module: NavModule): boolean {
  if (!m.supabase || m.loading || m.error !== null || m.isOwner) {
    return true;
  }
  return m.permissions[module].view === true;
}

/**
 * Landing target for the locale root: the first visible section in nav
 * order (§4.1 makes Booking the home tab), falling back to Menu when the
 * member can view none of the three.
 */
export function firstVisibleSection(permissions: MemberPermissions, isOwner: boolean): string {
  for (const mod of NAV_MODULES) {
    if (isOwner || permissions[mod].view === true) {
      return `/${mod}`;
    }
  }
  return '/menu';
}
