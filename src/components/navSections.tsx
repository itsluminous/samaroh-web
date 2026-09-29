'use client';

/**
 * The permission-gated nav modules (§1.2 + Notes + Files) with their icons
 * and label keys, plus the D15 bottom-bar split: the mobile bar shows at
 * most BOTTOM_BAR_MODULE_CAP modules before Menu; visible modules past the
 * cap overflow into the "More" section at the top of the Menu tab. Shared by
 * AppShell (rail + bar), MenuHome (More rows) and menu search.
 */
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import FolderIcon from '@mui/icons-material/Folder';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import type { ReactElement } from 'react';
import type { Membership } from '@/lib/permissions/useMembership';
import {
  type NavModule,
  splitNavModules,
  visibleNavModules,
} from '@/lib/permissions/visibility';

export interface NavSection {
  key: NavModule;
  href: string;
  icon: ReactElement;
  /** Catalog key of the tab label (module-owned fragments where they exist). */
  labelKey: string;
}

/** Module nav entries in D15 order. Labels resolve per entry — Notes/Files ship theirs in their own fragments. */
export const NAV_SECTIONS: readonly NavSection[] = [
  { key: 'booking', href: '/booking', icon: <CalendarMonthIcon />, labelKey: 'common.nav.booking' },
  { key: 'expenses', href: '/expenses', icon: <ReceiptLongIcon />, labelKey: 'common.nav.expenses' },
  { key: 'inventory', href: '/inventory', icon: <Inventory2Icon />, labelKey: 'common.nav.inventory' },
  { key: 'notes', href: '/notes', icon: <StickyNote2OutlinedIcon />, labelKey: 'notes.nav.tab' },
  { key: 'files', href: '/files', icon: <FolderIcon />, labelKey: 'files.nav.tab' },
];

export interface NavLayout {
  /** Every visible module (desktop rail — uncapped). */
  rail: NavSection[];
  /** Modules that fit the mobile bottom bar (before Menu). */
  bar: NavSection[];
  /** Visible modules past the cap — rendered under Menu → More. */
  overflow: NavSection[];
}

/** Resolves the nav layout for a membership (fail-open like canViewSection). */
export function resolveNavLayout(membership: Membership): NavLayout {
  const visible = new Set(visibleNavModules(membership));
  const rail = NAV_SECTIONS.filter((section) => visible.has(section.key));
  const { bar, overflow } = splitNavModules(rail);
  return { rail, bar, overflow };
}
