'use client';

/**
 * Reports hub (§4.4): list of the 10 reports. Access gated on
 * `reports.view` (owners pass implicitly); RLS is the real boundary.
 */
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useMembership } from '@/lib/permissions/useMembership';
import { isMoneyReport, REPORT_KEYS } from '@/lib/reports/types';

export default function ReportsHome() {
  const t = useTranslations();
  const { isOwner, permissions, loading } = useMembership();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!isOwner && !permissions.reports.view) {
    return (
      <Alert severity="warning">
        <Typography variant="subtitle2">{t('reports.permission.denied_title')}</Typography>
        {t('reports.permission.denied_message')}
      </Alert>
    );
  }

  // reports.view_amounts (absent = true): false hides the money reports
  // entirely — only the amount-free ones (occupancy, collection) stay.
  const showAmounts = isOwner || permissions.reports.view_amounts;
  const visibleKeys = REPORT_KEYS.filter((key) => showAmounts || !isMoneyReport(key));

  return (
    <>
      <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
        {t('reports.home.title')}
      </Typography>
      <Paper variant="outlined" sx={{ maxWidth: 640 }}>
        <List disablePadding>
          {visibleKeys.map((key) => (
            <ListItem key={key} disablePadding divider>
              <ListItemButton component={Link} href={`/menu/reports/${key}`}>
                <ListItemText primary={t(`reports.report.${key}`)} secondary={t(`reports.report.${key}_subtitle`)} />
                <ChevronRightIcon color="action" />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Paper>
    </>
  );
}
