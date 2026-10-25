/**
 * In-app Help (Menu → Help): the web view of the single-source user guide
 * `shared/help/guide.json` (copied in by `npm run gen:help`, see
 * scripts/gen-help.mjs). Pure data helpers — no React — so the filtering,
 * search and deep-link resolution are unit-testable against the real guide.
 *
 * Rules mirrored from the shared help/README.md:
 *   - a screen/task/step restricted with `platforms` shows only on those
 *     platforms (web filters to "web");
 *   - a screen/task with `permission` ("<section>.<capability>") is HIDDEN —
 *     never greyed — for a non-owner whose permission set lacks it;
 *   - `deepLink` ids resolve through help/routes.json to a web path; `{arg}`
 *     segments the guide cannot know are dropped so the parent list screen
 *     opens (e.g. `/expenses/{partyId}` → `/expenses`).
 */
import type { AppLocale } from '@/i18n/routing';
import type { MemberPermissions, PermissionModule } from '@/lib/permissions/permissions';
import { findSimilarItems } from '@/lib/fuzzy';
import guideJson from '@/generated/help/guide.json';
import routesJson from '@/generated/help/routes.json';

/**
 * Guide languages = app locales (`en` | `hi` | `hi-Latn`): the shared validator
 * enforces that every screen/task/step carries all three, so the UI locale can
 * index guide text directly (`title[lang]`). Help pages on GitHub Pages live
 * under `{baseUrl}{lang}/` with the same tag.
 */
export type HelpLang = AppLocale;
export type HelpPlatform = 'android' | 'web';
export type Localized = Record<HelpLang, string>;

export type HelpStep = Localized & {
  keys?: string[];
  platforms?: HelpPlatform[];
};

export interface HelpTask {
  id: string;
  title: Localized;
  deepLink: string;
  permission?: string;
  platforms?: HelpPlatform[];
  steps: HelpStep[];
}

export interface HelpScreen {
  id: string;
  title: Localized;
  summary: Localized;
  deepLink: string;
  permission?: string;
  platforms?: HelpPlatform[];
  tasks: HelpTask[];
}

export interface HelpGuide {
  version: number;
  languages: string[];
  site: { baseUrl: string; pagePattern: string; indexPattern: string };
  screens: HelpScreen[];
}

export interface HelpRoutes {
  routes: Record<string, { android: string | null; web: string | null }>;
}

// The generated JSON is structurally the schema above (validated by the shared
// validator before the copy); the casts just name the shape for TypeScript.
export const HELP_GUIDE = guideJson as unknown as HelpGuide;
export const HELP_ROUTES = routesJson as unknown as HelpRoutes;

/** Permission facts the visibility gate depends on (subset of `Membership`). */
export interface HelpGates {
  isOwner: boolean;
  permissions: MemberPermissions;
}

const WEB: HelpPlatform = 'web';

function onWeb(platforms: HelpPlatform[] | undefined): boolean {
  return !platforms || platforms.includes(WEB);
}

/**
 * True when the member may see an entry gated by `permission`. Owners see
 * everything; an unknown module/capability (schema drift) hides the entry
 * rather than failing open — the guide must never advertise a task the app
 * would refuse.
 */
export function canSeeHelpEntry(permission: string | undefined, gates: HelpGates): boolean {
  if (!permission) {
    return true;
  }
  if (gates.isOwner) {
    return true;
  }
  const [module, capability] = permission.split('.');
  if (!module || !capability) {
    return false;
  }
  const section = gates.permissions[module as PermissionModule] as Record<string, boolean> | undefined;
  return section?.[capability] === true;
}

/**
 * The guide as the web app shows it to this member: web-platform screens,
 * tasks and steps only, permission-gated entries removed, and screens that end
 * up with no tasks dropped. Order is the guide's order.
 */
export function filterGuideForWeb(screens: readonly HelpScreen[], gates: HelpGates): HelpScreen[] {
  const out: HelpScreen[] = [];
  for (const screen of screens) {
    if (!onWeb(screen.platforms) || !canSeeHelpEntry(screen.permission, gates)) {
      continue;
    }
    const tasks: HelpTask[] = [];
    for (const task of screen.tasks) {
      if (!onWeb(task.platforms) || !canSeeHelpEntry(task.permission, gates)) {
        continue;
      }
      const steps = task.steps.filter((step) => onWeb(step.platforms));
      if (steps.length > 0) {
        tasks.push({ ...task, steps });
      }
    }
    if (tasks.length > 0) {
      out.push({ ...screen, tasks });
    }
  }
  return out;
}

/**
 * Live search over screen titles/summaries, task titles and step text in the
 * UI language: case-insensitive substring first (screens keep only matching
 * tasks, unless the screen itself matched), then fuzzy task-title extras
 * (≥3 chars) via the shared matcher for typo tolerance. An empty query
 * returns the input unchanged.
 */
export function searchGuide(query: string, screens: readonly HelpScreen[], lang: HelpLang): HelpScreen[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) {
    return [...screens];
  }
  const has = (text: string) => text.toLowerCase().includes(q);
  const result: HelpScreen[] = [];
  for (const screen of screens) {
    const screenHit = has(screen.title[lang]) || has(screen.summary[lang]);
    const tasks = screen.tasks.filter(
      (task) => has(task.title[lang]) || task.steps.some((step) => has(step[lang])),
    );
    if (screenHit) {
      result.push(screen);
    } else if (tasks.length > 0) {
      result.push({ ...screen, tasks });
    } else {
      // Fuzzy fallback on task titles only (step prose is too long to score).
      const pool = screen.tasks.map((task) => ({ name: task.title[lang], task }));
      const fuzzy = findSimilarItems(q, pool, 0.5, 8).map((r) => r.item.task);
      if (fuzzy.length > 0) {
        result.push({ ...screen, tasks: fuzzy });
      }
    }
  }
  return result;
}

/**
 * Resolves a deepLink id to a locale-unprefixed web path, or null when the web
 * has no equivalent screen. `{arg}` segments are dropped (the guide does not
 * know the booking/party/item), so the parent list screen opens.
 */
export function resolveWebRoute(deepLink: string, routes: HelpRoutes = HELP_ROUTES): string | null {
  const route = routes.routes[deepLink];
  if (!route || route.web === null) {
    return null;
  }
  const kept = route.web.split('/').filter((segment) => segment.length > 0 && !/^\{.*\}$/.test(segment));
  return `/${kept.join('/')}`;
}

/**
 * Where Android opens a sheet, the web navigates to the page and opens the
 * same dialog via `?action=` (the target screens read it once on mount —
 * see useActionParam). Keyed by deepLink id (the route IS the sheet) or by
 * `screenId/taskId` where the task opens a dialog on a list screen.
 */
export const SHOW_ME_ACTIONS: Readonly<Record<string, string>> = {
  'booking/form': 'new_booking',
  'expenses/add_party': 'add_party',
  'booking_calendar/block_dates': 'block_dates',
  'inventory_stock/update_stock': 'update_stock',
  'inventory_masterlist/add_item': 'add_item',
};

/** The `?action=` values the screens understand (one per SHOW_ME_ACTIONS entry). */
export type ShowMeAction = 'new_booking' | 'add_party' | 'block_dates' | 'update_stock' | 'add_item';

/**
 * The "Show me" target for a task: its deepLink's web route plus, when the
 * task is a dialog the web can open directly, the `?action=` that opens it.
 * Null when the web has no route (the button is then hidden, not greyed).
 */
export function showMeHref(screenId: string, task: HelpTask, routes: HelpRoutes = HELP_ROUTES): string | null {
  const path = resolveWebRoute(task.deepLink, routes);
  if (path === null) {
    return null;
  }
  const action = SHOW_ME_ACTIONS[task.deepLink] ?? SHOW_ME_ACTIONS[`${screenId}/${task.id}`];
  return action ? `${path}?action=${action}` : path;
}

/**
 * Current web route → guide screen id, for "Help for this screen" and the
 * `<link rel="help">` metadata. Ordered most-specific first; `pathname` is the
 * locale-unprefixed path (next-intl's usePathname). Null = no section (e.g.
 * the Help page itself) → the Help index.
 */
const SCREEN_FOR_PATH: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\/booking(?:\/|$)/, 'booking_calendar'],
  [/^\/expenses\/[^/]+/, 'expenses_ledger'],
  [/^\/expenses(?:\/|$)/, 'expenses_home'],
  [/^\/inventory\/masterlist(?:\/|$)/, 'inventory_masterlist'],
  [/^\/inventory\/[^/]+/, 'inventory_item'],
  [/^\/inventory(?:\/|$)/, 'inventory_stock'],
  [/^\/notes(?:\/|$)/, 'notes'],
  [/^\/files(?:\/|$)/, 'files'],
  [/^\/menu\/help(?:\/|$)/, ''],
  [/^\/menu\/settings(?:\/|$)/, 'settings'],
  [/^\/menu\/members(?:\/|$)/, 'members'],
  [/^\/menu\/reports(?:\/|$)/, 'reports'],
  [/^\/menu(?:\/|$)/, 'menu'],
  [/^\/sign-in(?:\/|$)/, 'sign_in'],
];

export function screenIdForPath(pathname: string): string | null {
  const stripped = pathname.split('?')[0] ?? pathname;
  for (const [pattern, id] of SCREEN_FOR_PATH) {
    if (pattern.test(stripped)) {
      return id.length > 0 ? id : null;
    }
  }
  return null;
}

/** Public (GitHub Pages) URL of a screen's help page in `lang`, or the index. */
export function publicHelpUrl(lang: HelpLang, screenId: string | null, guide: HelpGuide = HELP_GUIDE): string {
  const { baseUrl, pagePattern, indexPattern } = guide.site;
  const pattern = screenId ? pagePattern : indexPattern;
  return pattern.replace('{baseUrl}', baseUrl).replace('{lang}', lang).replace('{screenId}', screenId ?? '');
}

/**
 * In-app Help route for a screen section (locale-unprefixed). Uses the same
 * `?hl=` scroll-and-highlight convention as menu search (useHighlightParam),
 * so the Help page needs no param plumbing of its own.
 */
export function helpRouteFor(screenId: string | null): string {
  return screenId ? `/menu/help?hl=${encodeURIComponent(screenId)}` : '/menu/help';
}

/** DOM id of a screen's section on the Help page (useHighlightParam target). */
export function helpSectionDomId(screenId: string): string {
  return `hl-${screenId}`;
}
