'use client';

/**
 * Menu tab home (§4.4): identity row (who is signed in) followed by the
 * section list — Settings, Reports, Members (owner only), About. Members is
 * hidden (not just disabled) for employees.
 *
 * A search bar on top filters a static localized index of EVERY destination
 * nested under the Menu tab (settings rows, About items, the 10 reports,
 * sign-out) — see src/lib/menuSearch.ts. Results reuse the exact permission
 * gates of the rows they point at, so nothing unreachable ever surfaces.
 * An empty query shows the normal menu.
 */
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import GroupIcon from '@mui/icons-material/Group';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import InsightsIcon from '@mui/icons-material/Insights';
import SearchIcon from '@mui/icons-material/Search';
import SettingsIcon from '@mui/icons-material/Settings';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useHighlightParam } from '@/lib/hooks/useHighlightParam';
import { useSignedIn } from '@/lib/hooks/useSignedIn';
import { buildMenuSearchIndex, filterMenuSearchEntries } from '@/lib/menuSearch';
import { useMembership } from '@/lib/permissions/useMembership';
import MenuIdentityRow from './MenuIdentityRow';

/** How long the identity row stays tinted after a sign-out search hit (ms). */
const IDENTITY_HIGHLIGHT_MS = 2400;

export default function MenuHome({ title }: { title: string }) {
  const t = useTranslations();
  const tSection = useTranslations('menu.section');
  const { isOwner, permissions } = useMembership();
  const signedIn = useSignedIn();

  const [query, setQuery] = useState('');
  // The sign-out result points at the identity row on THIS page: clicking it
  // clears the query (restoring the menu) and tints the row briefly, either
  // via the ?hl= param (arriving from elsewhere) or this local flag.
  const hlParam = useHighlightParam(['identity']);
  const [identityFlash, setIdentityFlash] = useState(false);
  useEffect(() => {
    if (!identityFlash) {
      return;
    }
    const timer = setTimeout(() => setIdentityFlash(false), IDENTITY_HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [identityFlash]);

  const index = useMemo(
    () => buildMenuSearchIndex({ isOwner, permissions, signedIn }, t),
    [isOwner, permissions, signedIn, t],
  );
  const trimmed = query.trim();
  const results = useMemo(() => filterMenuSearchEntries(query, index), [query, index]);

  const rows = [
    { key: 'settings', href: '/menu/settings', icon: <SettingsIcon />, show: true },
    { key: 'reports', href: '/menu/reports', icon: <InsightsIcon />, show: true },
    { key: 'members', href: '/menu/members', icon: <GroupIcon />, show: isOwner },
    { key: 'about', href: '/menu/about', icon: <InfoOutlinedIcon />, show: true },
  ] as const;

  return (
    <>
      <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
        {title}
      </Typography>

      <TextField
        fullWidth
        size="small"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('menu.search.placeholder')}
        sx={{ mb: 2, maxWidth: 640, display: 'block' }}
        slotProps={{
          htmlInput: { 'aria-label': t('menu.search.placeholder') },
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
            endAdornment:
              query.length > 0 ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    edge="end"
                    aria-label={t('menu.search.clear')}
                    onClick={() => setQuery('')}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
          },
        }}
      />

      {trimmed.length > 0 ? (
        results.length === 0 ? (
          <Typography color="text.secondary" sx={{ maxWidth: 640 }}>
            {t('menu.search.no_results')}
          </Typography>
        ) : (
          <Paper variant="outlined" sx={{ maxWidth: 640 }}>
            <List disablePadding>
              {results.map((result) => (
                <ListItem key={result.id} disablePadding divider>
                  <ListItemButton
                    component={Link}
                    href={result.href}
                    onClick={(e) => {
                      if (result.id === 'sign_out') {
                        // Same page — restore the menu and flash the row
                        // that carries the sign-out button instead of a
                        // no-op navigation.
                        e.preventDefault();
                        setQuery('');
                        setIdentityFlash(true);
                      }
                    }}
                  >
                    <ListItemText primary={result.label} secondary={result.section} />
                    <ChevronRightIcon color="action" />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Paper>
        )
      ) : (
        <Paper variant="outlined" sx={{ maxWidth: 640 }}>
          <List disablePadding>
            <MenuIdentityRow highlighted={identityFlash || hlParam === 'identity'} />
            {rows
              .filter((row) => row.show)
              .map((row) => (
                <ListItem key={row.key} disablePadding divider>
                  <ListItemButton component={Link} href={row.href}>
                    <ListItemIcon>{row.icon}</ListItemIcon>
                    <ListItemText primary={tSection(row.key)} secondary={tSection(`${row.key}_subtitle`)} />
                    <ChevronRightIcon color="action" />
                  </ListItemButton>
                </ListItem>
              ))}
          </List>
        </Paper>
      )}
    </>
  );
}
