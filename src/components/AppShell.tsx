'use client';

import MenuIcon from '@mui/icons-material/Menu';
import MoreVertIcon from '@mui/icons-material/MoreVert';
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
import type { ReactNode } from 'react';
import { resolveNavLayout } from '@/components/navSections';
import SyncIndicator from '@/components/SyncIndicator';
import { Link, usePathname } from '@/i18n/navigation';
import { useFitText } from '@/lib/hooks/useFitText';
import { useMembership } from '@/lib/permissions/useMembership';

const RAIL_WIDTH = 220;

// Menu is always visible: last entry of the desktop rail, and the title-bar
// kebab on mobile (owner feedback 2026-09-29 — it no longer takes a bottom-bar
// slot; Files sits there directly).
const MENU_SECTION = { key: 'menu', href: '/menu', icon: <MenuIcon />, labelKey: 'common.nav.menu' } as const;

export default function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();
  const membership = useMembership();

  // Modules the member cannot view disappear from BOTH navs (§3); Menu is
  // always reachable. Degraded modes (loading, guest, unconfigured) fail
  // open. Desktop rail lists every visible module + Menu; the mobile bar is
  // modules only (capped at 5) and any overflow surfaces under Menu → More.
  const layout = resolveNavLayout(membership);
  const railSections = [...layout.rail, MENU_SECTION];
  const barSections = layout.bar;

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const barActiveIndex = barSections.findIndex((s) => isActive(s.href));
  const menuActive = isActive(MENU_SECTION.href);

  // Top bar shows the ACTIVE BUSINESS NAME (Android parity); the app name is
  // the fallback for the no-business states (signed out, guest without a
  // business, membership still loading/errored).
  const title = membership.business?.name?.trim() || t('common.app_name');
  // Long names shrink (down to 65% of the h6 size) instead of wrapping or
  // truncating hard; past the floor the ellipsis takes over.
  const titleRef = useFitText<HTMLHeadingElement>(title);
  const menuLabel = t(MENU_SECTION.labelKey);

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
          {/* No language switcher and NO sign-out here (Android parity): the
              language picker lives at Menu → Settings → Language, sign-out on
              the Menu identity row (guest mode: its Sign in action) — both
              menu-searchable. */}
          {/* Mobile: the kebab to the right of the sync icon opens the
              existing Menu route (same as Android's top-bar kebab → Menu
              screen). Desktop keeps Menu as the last rail entry instead. */}
          <Tooltip title={menuLabel}>
            <IconButton
              component={Link}
              href={MENU_SECTION.href}
              aria-label={menuLabel}
              aria-current={menuActive ? 'page' : undefined}
              color={menuActive ? 'primary' : 'default'}
              edge="end"
              sx={{ display: { xs: 'inline-flex', md: 'none' } }}
            >
              <MoreVertIcon />
            </IconButton>
          </Tooltip>
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
          {railSections.map((section) => (
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
          // Keep content clear of the mobile bottom nav (when it renders).
          pb: { xs: barSections.length > 0 ? 10 : 3, md: 3 },
        }}
      >
        <Toolbar />
        {children}
      </Box>

      {/* Mobile: fixed bottom navigation — modules only. A member who can
          view no module gets no bar at all (Menu is the kebab). */}
      {barSections.length > 0 ? (
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
          <BottomNavigation showLabels value={barActiveIndex === -1 ? false : barActiveIndex}>
            {barSections.map((section) => (
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
      ) : null}
    </Box>
  );
}
