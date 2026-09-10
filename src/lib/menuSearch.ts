/**
 * Menu search (§4.4 parity): a static, localized index of every destination
 * reachable from the Menu tab — section pages, settings rows, the About
 * items, all 10 report names and the sign-out affordance — filtered live by
 * substring plus the shared fuzzy matcher.
 *
 * Permission parity is the hard rule: an entry's `visible` gate reuses the
 * EXACT same condition as the menu row it points at (owner-only Members,
 * `settings.manage_business` for event types,
 * `reports.view` + `reports.view_amounts` for the report list), so search
 * can never surface a destination the current member cannot reach.
 */
import { findSimilarItems } from '@/lib/fuzzy';
import type { MemberPermissions } from '@/lib/permissions/permissions';
import { isMoneyReport, REPORT_KEYS } from '@/lib/reports/types';

/** Membership facts the visibility gates depend on. */
export interface MenuSearchGates {
  isOwner: boolean;
  permissions: MemberPermissions;
  /** True only with a real (non-guest) session — gates the sign-out entry. */
  signedIn: boolean;
}

/** A resolved (localized) search result. */
export interface MenuSearchEntry {
  id: string;
  /** Localized primary label — what the query is matched against. */
  label: string;
  /** Localized parent-section label, shown as the secondary line. */
  section: string;
  /**
   * Route to navigate to (locale-unprefixed, may carry a `?hl=` anchor that
   * the target screen scrolls to and highlights).
   */
  href: string;
  /** Extra localized strings the query also matches against. */
  keywords: string[];
}

type Translate = (key: string) => string;

interface EntryDef {
  id: string;
  labelKey: string;
  sectionKey: string;
  href: string;
  keywordKeys?: string[];
  /** Same condition as the menu row this entry points at; absent = always. */
  visible?: (gates: MenuSearchGates) => boolean;
}

/** Gate for the event-types row (business-profile EDITING shares it, but the read-only card shows for all). */
const canEditBusiness = (g: MenuSearchGates) => g.isOwner || g.permissions.settings.manage_business;

/** Gate of the reports hub (ReportsHome renders the denied state otherwise). */
const canViewReports = (g: MenuSearchGates) => g.isOwner || g.permissions.reports.view;

const ENTRY_DEFS: readonly EntryDef[] = [
  // Menu home sections (MenuHome rows).
  { id: 'settings', labelKey: 'menu.section.settings', sectionKey: 'menu.home.title', href: '/menu/settings', keywordKeys: ['menu.section.settings_subtitle'] },
  { id: 'reports', labelKey: 'menu.section.reports', sectionKey: 'menu.home.title', href: '/menu/reports', keywordKeys: ['menu.section.reports_subtitle'] },
  {
    id: 'members',
    labelKey: 'menu.section.members',
    sectionKey: 'menu.home.title',
    href: '/menu/members',
    keywordKeys: ['menu.section.members_subtitle'],
    visible: (g) => g.isOwner, // MenuHome hides (not disables) Members for non-owners.
  },
  { id: 'about', labelKey: 'menu.section.about', sectionKey: 'menu.home.title', href: '/menu/about', keywordKeys: ['menu.section.about_subtitle'] },
  // Sign-out lives on the identity row of the menu home (real session only).
  {
    id: 'sign_out',
    labelKey: 'menu.identity.sign_out',
    sectionKey: 'menu.home.title',
    href: '/menu?hl=identity',
    visible: (g) => g.signedIn,
  },
  // Settings rows (SettingsScreen).
  {
    id: 'language',
    labelKey: 'settings.language.title',
    sectionKey: 'menu.section.settings',
    href: '/menu/settings/language',
    keywordKeys: ['settings.language.name_en', 'settings.language.name_hi'],
  },
  {
    id: 'theme',
    labelKey: 'settings.theme.title',
    sectionKey: 'menu.section.settings',
    href: '/menu/settings?hl=theme',
    keywordKeys: ['settings.theme.light', 'settings.theme.dark', 'settings.theme.system'],
  },
  {
    id: 'event_types',
    labelKey: 'settings.event_types.title',
    sectionKey: 'menu.section.settings',
    href: '/menu/settings/event-types',
    visible: canEditBusiness, // same gate as the row (event_types RLS parity).
  },
  { id: 'sync', labelKey: 'settings.sync.title', sectionKey: 'menu.section.settings', href: '/menu/settings/sync' },
  { id: 'google', labelKey: 'settings.google.title', sectionKey: 'menu.section.settings', href: '/menu/settings?hl=google' },
  {
    id: 'booking_form',
    labelKey: 'settings.booking_form.title',
    sectionKey: 'menu.section.settings',
    href: '/menu/settings?hl=booking_form',
    keywordKeys: ['settings.booking_form.subtitle'],
  },
  {
    id: 'business',
    labelKey: 'settings.business.title',
    sectionKey: 'menu.section.settings',
    href: '/menu/settings?hl=business',
    // Always visible: editors get the profile editor, everyone else the
    // read-only display card — both render on the settings page.
  },
  // About items (all on the About page).
  { id: 'about_source', labelKey: 'menu.about.source_code', sectionKey: 'menu.section.about', href: '/menu/about' },
  { id: 'about_licenses', labelKey: 'menu.about.licenses', sectionKey: 'menu.section.about', href: '/menu/about' },
  // The 10 reports (ReportsHome list, same visibility math).
  ...REPORT_KEYS.map((key): EntryDef => ({
    id: `report_${key}`,
    labelKey: `reports.report.${key}`,
    sectionKey: 'menu.section.reports',
    href: `/menu/reports/${key}`,
    keywordKeys: [`reports.report.${key}_subtitle`],
    visible: (g) =>
      canViewReports(g) && (g.isOwner || g.permissions.reports.view_amounts || !isMoneyReport(key)),
  })),
];

/**
 * Builds the localized index for the current member. `t` is a root-namespace
 * translator (`useTranslations()`); labels are resolved eagerly so filtering
 * and tests operate on plain strings.
 */
export function buildMenuSearchIndex(gates: MenuSearchGates, t: Translate): MenuSearchEntry[] {
  return ENTRY_DEFS.filter((def) => def.visible?.(gates) ?? true).map((def) => ({
    id: def.id,
    label: t(def.labelKey),
    section: t(def.sectionKey),
    href: def.href,
    keywords: (def.keywordKeys ?? []).map((key) => t(key)),
  }));
}

/**
 * Live filter: case-insensitive substring over label + keywords (prefix
 * matches first), then fuzzy extras via the shared matcher (≥3 chars) for
 * typo tolerance. Empty/whitespace queries return [] — the caller shows the
 * normal menu instead.
 */
export function filterMenuSearchEntries(query: string, entries: MenuSearchEntry[]): MenuSearchEntry[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) {
    return [];
  }

  const matchesSubstring = (entry: MenuSearchEntry) =>
    entry.label.toLowerCase().includes(q) || entry.keywords.some((k) => k.toLowerCase().includes(q));

  const substring = entries
    .filter(matchesSubstring)
    .sort((a, b) => Number(b.label.toLowerCase().startsWith(q)) - Number(a.label.toLowerCase().startsWith(q)));

  const matchedIds = new Set(substring.map((entry) => entry.id));
  const fuzzyPool = entries
    .filter((entry) => !matchedIds.has(entry.id))
    .map((entry) => ({ name: entry.label, entry }));
  const fuzzy = findSimilarItems(q, fuzzyPool, 0.5, 8).map((result) => result.item.entry);

  return [...substring, ...fuzzy];
}
