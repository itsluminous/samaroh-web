'use client';

import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import AppBar from '@mui/material/AppBar';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import type { FormEvent, ReactNode } from 'react';
import SyncIndicator from '@/components/SyncIndicator';
import { Link, usePathname } from '@/i18n/navigation';
import { useFitText } from '@/lib/hooks/useFitText';
import { clearOutbox } from '@/lib/outbox/outbox';
import { useMembership } from '@/lib/permissions/useMembership';
import { canViewSection, type NavModule } from '@/lib/permissions/visibility';

const RAIL_WIDTH = 220;

// The 5 sections (§1.2 + Notes): left rail on desktop, bottom nav on mobile.
// Labels resolve per entry — the Notes tab label lives in the notes fragment
// (notes.nav.tab) rather than common.nav.
const SECTIONS = [
  { key: 'booking', href: '/booking', icon: <CalendarMonthIcon />, labelKey: 'common.nav.booking' },
  { key: 'expenses', href: '/expenses', icon: <ReceiptLongIcon />, labelKey: 'common.nav.expenses' },
  { key: 'inventory', href: '/inventory', icon: <Inventory2Icon />, labelKey: 'common.nav.inventory' },
  { key: 'notes', href: '/notes', icon: <StickyNote2OutlinedIcon />, labelKey: 'notes.nav.tab' },
  { key: 'menu', href: '/menu', icon: <MenuIcon />, labelKey: 'common.nav.menu' },
] as const;

export default function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();
  const membership = useMembership();

  // Modules the member cannot view disappear from BOTH navs (§3); Menu is
  // always visible. Degraded modes (loading, guest, unconfigured) fail open.
  const sections = SECTIONS.filter(
    (s) => s.key === 'menu' || canViewSection(membership, s.key as NavModule),
  );

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const activeIndex = sections.findIndex((s) => isActive(s.href));

  // Top bar shows the ACTIVE BUSINESS NAME (Android parity); the app name is
  // the fallback for the no-business states (signed out, guest without a
  // business, membership still loading/errored).
  const title = membership.business?.name?.trim() || t('common.app_name');
  // Long names shrink (down to 65% of the h6 size) instead of wrapping or
  // truncating hard; past the floor the ellipsis takes over.
  const titleRef = useFitText<HTMLHeadingElement>(title);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        color="default"
        elevation={0}
        sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, borderBottom: 1, borderColor: 'divider' }}
      >
        <Toolbar sx={{ gap: 2 }}>
          <Typography
            ref={titleRef}
            variant="h6"
            component="h1"
            color="primary"
            sx={{
              flexGrow: 1,
              minWidth: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </Typography>
          <SyncIndicator />
          {/* No language switcher here (Android parity): the full picker
              lives at Menu → Settings → Language (menu-searchable) — the
              freed toolbar width goes to the business-name title. */}
          {/* Sign-out posts to the non-localized auth route. The outbox is
              wiped first (ADR-040 parity — see clearOutbox) so a later
              session on this browser can never replay this session's writes. */}
          <Box
            component="form"
            action="/auth/sign-out"
            method="post"
            sx={{ display: 'flex' }}
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              const form = event.currentTarget;
              event.preventDefault();
              void clearOutbox().finally(() => form.submit());
            }}
          >
            <Tooltip title={t('auth.action.sign_out')}>
              <IconButton type="submit" aria-label={t('auth.action.sign_out')}>
                <LogoutIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Desktop: permanent left rail */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          width: RAIL_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': { width: RAIL_WIDTH, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <List component="nav">
          {sections.map((section) => (
            <ListItem key={section.key} disablePadding>
              <ListItemButton
                component={Link}
                href={section.href}
                selected={isActive(section.href)}
                sx={{ borderRadius: 100, mx: 1, my: 0.25 }}
              >
                <ListItemIcon>{section.icon}</ListItemIcon>
                <ListItemText primary={t(section.labelKey)} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          // Flex items default to min-width:auto — without this, any child
          // whose min-content is wider than the viewport (long chips, wide
          // rows) inflates <main> and the whole page pans/clips sideways on
          // narrow phones instead of the row scrolling or wrapping locally.
          minWidth: 0,
          p: 3,
          pb: { xs: 10, md: 3 }, // keep content clear of the mobile bottom nav
        }}
      >
        <Toolbar />
        {children}
      </Box>

      {/* Mobile: fixed bottom navigation */}
      <Paper
        elevation={3}
        sx={{
          display: { xs: 'block', md: 'none' },
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: (theme) => theme.zIndex.appBar,
        }}
      >
        <BottomNavigation showLabels value={activeIndex === -1 ? false : activeIndex}>
          {sections.map((section) => (
            <BottomNavigationAction
              key={section.key}
              component={Link}
              href={section.href}
              label={t(section.labelKey)}
              icon={section.icon}
            />
          ))}
        </BottomNavigation>
      </Paper>
    </Box>
  );
}
