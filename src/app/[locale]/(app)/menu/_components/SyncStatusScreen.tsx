'use client';

/**
 * Sync status screen (§4.4 / §8): pending-outbox count, the queued-changes
 * list with per-item status (queued / error / LWW conflict), last sync time
 * and a "Sync now" button. Failed and conflicting items can be discarded.
 */
import SyncIcon from '@mui/icons-material/Sync';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { OutboxItem } from '@/lib/outbox/db';
import { useOutbox } from '@/lib/outbox/useOutbox';
import { useMembership } from '@/lib/permissions/useMembership';

export default function SyncStatusScreen() {
  const t = useTranslations();
  const locale = useLocale();
  const { supabase } = useMembership();
  const { items, pendingCount, lastSyncAt, online, syncing, loaded, syncNow, discard } = useOutbox(supabase);

  const timeFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }),
    [locale],
  );

  const opLabel = (item: OutboxItem) =>
    item.operation === 'create'
      ? t('settings.sync.op_create')
      : item.operation === 'delete'
        ? t('settings.sync.op_delete')
        : t('settings.sync.op_update');

  const statusChip = (item: OutboxItem) => {
    if (item.status === 'error') {
      return <Chip size="small" color="error" label={t('settings.sync.status_error')} />;
    }
    if (item.status === 'conflict') {
      return <Chip size="small" color="warning" label={t('settings.sync.status_conflict')} />;
    }
    return <Chip size="small" label={t('settings.sync.status_queued')} />;
  };

  return (
    <Stack spacing={3} sx={{ maxWidth: 640 }}>
      <Typography variant="h5" component="h1">
        {t('settings.sync.title')}
      </Typography>

      {!online ? <Alert severity="warning">{t('common.state.offline_banner')}</Alert> : null}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Box>
            <Typography variant="h6">
              {pendingCount > 0
                ? t('settings.sync.pending', { count: pendingCount })
                : t('settings.sync.all_synced')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {lastSyncAt
                ? t('settings.sync.last_sync', { time: timeFormat.format(new Date(lastSyncAt)) })
                : t('settings.sync.not_synced_yet')}
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<SyncIcon />}
            onClick={() => void syncNow()}
            disabled={syncing || !supabase}
          >
            {t('settings.sync.sync_now')}
          </Button>
        </Stack>
      </Paper>

      {loaded && items.length === 0 ? (
        <Alert severity="success">{t('settings.sync.all_synced_message')}</Alert>
      ) : null}

      {items.length > 0 ? (
        <Paper variant="outlined">
          <Typography variant="subtitle1" sx={{ px: 2, pt: 2 }}>
            {t('settings.sync.queue_title')}
          </Typography>
          <List>
            {items.map((item) => (
              <ListItem
                key={item.seq}
                divider
                secondaryAction={
                  item.status !== 'queued' ? (
                    <Button size="small" color="error" onClick={() => void discard(item.seq)}>
                      {t('settings.sync.discard')}
                    </Button>
                  ) : null
                }
              >
                <ListItemText
                  disableTypography
                  primary={
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                      <Typography variant="body1">{opLabel(item)}</Typography>
                      <Typography variant="body1" noWrap color="text.secondary">
                        {t('settings.sync.error_entity', { entity: item.label })}
                      </Typography>
                      {statusChip(item)}
                    </Stack>
                  }
                  secondary={
                    item.last_error ? (
                      <Typography variant="body2" color="error" sx={{ mt: 0.5 }}>
                        {item.last_error}
                      </Typography>
                    ) : null
                  }
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      ) : null}
    </Stack>
  );
}
