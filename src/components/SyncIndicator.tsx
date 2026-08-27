'use client';

/**
 * App-bar sync/cloud indicator: shows the pending-outbox count as a badge and
 * spins (CSS rotate) while an outbox replay is actively running so the user
 * knows sync is in progress. Users with `prefers-reduced-motion` get a static
 * fallback instead: no rotation, the icon switches to the primary color and
 * the accessible name/tooltip still reads "Syncing…". Tapping opens the sync
 * status screen. Hidden in guest mode (no server to sync with) and when
 * Supabase is unconfigured.
 */
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import Badge from '@mui/material/Badge';
import IconButton from '@mui/material/IconButton';
import { keyframes } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { Link } from '@/i18n/navigation';
import { isLocalClient } from '@/lib/guest/localClient';
import { useOutbox } from '@/lib/outbox/useOutbox';
import { createClient } from '@/lib/supabase/client';

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

export default function SyncIndicator() {
  const t = useTranslations();
  const supabase = useMemo(() => createClient(), []);
  const { pendingCount, syncing, loaded } = useOutbox(supabase);

  // Guest mode is device-only (nothing ever syncs) and without Supabase env
  // there is no server either — the indicator would only mislead.
  if (!supabase || isLocalClient(supabase) || !loaded) {
    return null;
  }

  const label = syncing ? t('sync.notification.syncing') : t('settings.sync.title');

  return (
    <Tooltip title={label}>
      <IconButton component={Link} href="/menu/settings/sync" aria-label={label}>
      <Badge badgeContent={pendingCount} color="warning">
        <CloudSyncIcon
          color={syncing ? 'primary' : 'inherit'}
          sx={
            syncing
              ? {
                  animation: `${spin} 1.4s linear infinite`,
                  // Reduced motion: keep the static color-change cue only.
                  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                }
              : undefined
          }
        />
      </Badge>
      </IconButton>
    </Tooltip>
  );
}
