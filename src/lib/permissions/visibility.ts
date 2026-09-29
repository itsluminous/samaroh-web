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

/**
 * The five permission-gated nav sections in module order (shared Files
 * design D15: Booking, Expenses, Inventory, Notes, Files); Menu is always
 * visible and always last.
 */
export const NAV_MODULES = ['booking', 'expenses', 'inventory', 'notes', 'files'] as const;
export type NavModule = (typeof NAV_MODULES)[number];

/**
 * Bottom-bar cap (D15 as amended by owner feedback 2026-09-29): the mobile
 * bottom bar holds MODULES ONLY — Menu moved to the title-bar kebab — so
 * Material 3's 5-item limit is all modules. Visible modules fill the bar in
 * order; anything past the cap (none today: NAV_MODULES has exactly 5
 * entries) overflows into the "More" section at the top of the Menu tab (and
 * into menu search). The desktop rail is uncapped and keeps Menu last.
 */
export const BOTTOM_BAR_MODULE_CAP = 5;

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

/** Visible modules in nav order (the rail listing; input to the bar split). */
export function visibleNavModules(m: VisibilityInput): NavModule[] {
  return NAV_MODULES.filter((module) => canViewSection(m, module));
}

/**
 * Splits the visible modules into the bottom-bar set (first `cap`) and the
 * overflow set (everything past it) — the rule shared with Android and
 * web-mobile. With the cap at 5 and five modules, a full-permission owner
 * sees Booking/Expenses/Inventory/Notes/Files in the bar and nothing
 * overflows; the split stays so a sixth module would land under Menu → More
 * instead of crowding the bar.
 */
export function splitNavModules<T extends { key: NavModule }>(
  visible: readonly T[],
  cap: number = BOTTOM_BAR_MODULE_CAP,
): { bar: T[]; overflow: T[] } {
  return { bar: visible.slice(0, cap), overflow: visible.slice(cap) };
}

/**
 * Landing target for the locale root: the first visible section in nav
 * order (§4.1 makes Booking the home tab), falling back to Menu when the
 * member can view none of the modules.
 */
export function firstVisibleSection(permissions: MemberPermissions, isOwner: boolean): string {
  for (const mod of NAV_MODULES) {
    if (isOwner || permissions[mod].view === true) {
      return `/${mod}`;
    }
  }
  return '/menu';
}
