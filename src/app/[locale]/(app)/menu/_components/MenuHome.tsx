'use client';

/**
 * Menu tab home (§4.4): section list — Settings, Reports, Members (owner
 * only), About. Members is hidden (not just disabled) for employees.
 */
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import GroupIcon from '@mui/icons-material/Group';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import InsightsIcon from '@mui/icons-material/Insights';
import SettingsIcon from '@mui/icons-material/Settings';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useMembership } from '@/lib/permissions/useMembership';

export default function MenuHome({ title }: { title: string }) {
  const t = useTranslations('menu.section');
  const { isOwner } = useMembership();

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
      <Paper variant="outlined" sx={{ maxWidth: 640 }}>
        <List disablePadding>
          {rows
            .filter((row) => row.show)
            .map((row) => (
              <ListItem key={row.key} disablePadding divider>
                <ListItemButton component={Link} href={row.href}>
                  <ListItemIcon>{row.icon}</ListItemIcon>
                  <ListItemText primary={t(row.key)} secondary={t(`${row.key}_subtitle`)} />
                  <ChevronRightIcon color="action" />
                </ListItemButton>
              </ListItem>
            ))}
        </List>
      </Paper>
    </>
  );
}
