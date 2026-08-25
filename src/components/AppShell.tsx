'use client';

import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
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
import LocaleSwitcher from '@/components/LocaleSwitcher';
import { Link, usePathname } from '@/i18n/navigation';

const RAIL_WIDTH = 220;

// The 4 sections (§1.2): left rail on desktop, bottom nav on mobile.
const SECTIONS = [
  { key: 'booking', href: '/booking', icon: <CalendarMonthIcon /> },
  { key: 'expenses', href: '/expenses', icon: <ReceiptLongIcon /> },
  { key: 'inventory', href: '/inventory', icon: <Inventory2Icon /> },
  { key: 'menu', href: '/menu', icon: <MenuIcon /> },
] as const;

export default function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const activeIndex = SECTIONS.findIndex((s) => isActive(s.href));

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        color="default"
        elevation={0}
        sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, borderBottom: 1, borderColor: 'divider' }}
      >
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6" component="h1" color="primary" sx={{ flexGrow: 1 }}>
            {t('common.app_name')}
          </Typography>
          <LocaleSwitcher />
          {/* Sign-out posts to the non-localized auth route. */}
          <Box component="form" action="/auth/sign-out" method="post" sx={{ display: 'flex' }}>
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
          {SECTIONS.map((section) => (
            <ListItem key={section.key} disablePadding>
              <ListItemButton
                component={Link}
                href={section.href}
                selected={isActive(section.href)}
                sx={{ borderRadius: 100, mx: 1, my: 0.25 }}
              >
                <ListItemIcon>{section.icon}</ListItemIcon>
                <ListItemText primary={t(`common.nav.${section.key}`)} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
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
          {SECTIONS.map((section) => (
            <BottomNavigationAction
              key={section.key}
              component={Link}
              href={section.href}
              label={t(`common.nav.${section.key}`)}
              icon={section.icon}
            />
          ))}
        </BottomNavigation>
      </Paper>
    </Box>
  );
}
