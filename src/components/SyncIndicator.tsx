'use client';

/**
 * App-bar sync/cloud indicator: shows the pending-outbox count as a badge.
 * While an outbox replay is actively running the icon swaps to a plain
 * circular-arrows sync glyph that spins (CSS rotate) — parity with the
 * Android app, where a rotating cloud read oddly. Idle keeps the cloud
 * iconography. Users with `prefers-reduced-motion` get a static fallback
 * instead: no rotation, but the icon swap + primary color remain and the
 * accessible name/tooltip still reads "Syncing…". Tapping opens the sync
 * status screen. Hidden in guest mode (no server to sync with) and when
 * Supabase is unconfigured.
 */
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import SyncIcon from '@mui/icons-material/Sync';
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
  to { transform: rotate(-360deg); }
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
        {syncing ? (
          // Counter-clockwise spin: the Sync glyph's arrowheads point that
          // way, so rotating +360deg would look like it runs backwards.
          <SyncIcon
            color="primary"
            sx={{
              animation: `${spin} 1.4s linear infinite`,
              // Reduced motion: keep the static icon-swap + color cue only.
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
            }}
          />
        ) : (
          <CloudSyncIcon color="inherit" />
        )}
      </Badge>
      </IconButton>
    </Tooltip>
  );
}
