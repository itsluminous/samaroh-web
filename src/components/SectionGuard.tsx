'use client';

/**
 * Route guard for the permission-gated sections (Booking / Expenses /
 * Inventory). Direct-URL access to a section the member cannot view renders
 * the localized no-access state instead of the screen; every degraded mode
 * (Supabase unconfigured, guest mode, no session, no business) fails open —
 * the screens have their own empty states and RLS protects the data.
 */
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useMembership } from '@/lib/permissions/useMembership';
import { canViewSection, type NavModule } from '@/lib/permissions/visibility';

export default function SectionGuard({ module, children }: { module: NavModule; children: ReactNode }) {
  const t = useTranslations();
  const membership = useMembership();

  if (membership.supabase && membership.loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }} aria-label={t('common.state.loading')}>
        <CircularProgress />
      </Box>
    );
  }

  if (!canViewSection(membership, module)) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <LockOutlinedIcon color="disabled" sx={{ fontSize: 48, mb: 1 }} />
        <Typography variant="h6">{t('common.permission.no_access_title')}</Typography>
        <Typography color="text.secondary">{t('common.permission.no_access_message')}</Typography>
      </Box>
    );
  }

  return <>{children}</>;
}
