'use client';

/**
 * Settings screen (§4.4, web scope):
 *   - Language → full-screen picker page (each language in its own script)
 *   - Theme: system / light / dark (MUI color-scheme CSS variables)
 *   - Business profile editor (owner or settings.manage_business)
 *   - Sync status → pending-outbox page, with a live count badge
 *   - Google account: stub row in its "not configured" state (§4.4 — OAuth
 *     client wiring is a deployment concern, tracked in docs/decisions.md)
 */
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LanguageIcon from '@mui/icons-material/Language';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useColorScheme } from '@mui/material/styles';
import { useLocale, useTranslations } from 'next-intl';
import type { ChangeEvent } from 'react';
import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useOutbox } from '@/lib/outbox/useOutbox';
import { useMembership } from '@/lib/permissions/useMembership';

type ThemeMode = 'system' | 'light' | 'dark';

export default function SettingsScreen() {
  const t = useTranslations();
  const locale = useLocale();
  const { supabase, business, isOwner, permissions, refresh } = useMembership();
  const { pendingCount } = useOutbox(supabase);
  const { mode, setMode } = useColorScheme();

  const canEditBusiness = isOwner || permissions.settings.manage_business;

  return (
    <Stack spacing={3} sx={{ maxWidth: 640 }}>
      <Typography variant="h5" component="h1">
        {t('settings.title')}
      </Typography>

      <Paper variant="outlined">
        <List disablePadding>
          {/* Language — links to the full-screen picker (own scripts). */}
          <ListItem disablePadding divider>
            <ListItemButton component={Link} href="/menu/settings/language">
              <ListItemIcon>
                <LanguageIcon />
              </ListItemIcon>
              <ListItemText
                primary={t('settings.language.title')}
                secondary={locale === 'hi' ? t('settings.language.name_hi') : t('settings.language.name_en')}
              />
              <ChevronRightIcon color="action" />
            </ListItemButton>
          </ListItem>

          {/* Theme: system / light / dark. */}
          <ListItem divider sx={{ flexWrap: 'wrap', gap: 1 }}>
            <ListItemIcon>
              <DarkModeIcon />
            </ListItemIcon>
            <ListItemText primary={t('settings.theme.title')} />
            <ToggleButtonGroup
              exclusive
              size="small"
              value={(mode ?? 'system') as ThemeMode}
              onChange={(_e, value: ThemeMode | null) => {
                if (value) {
                  setMode(value);
                }
              }}
            >
              <ToggleButton value="system">{t('settings.theme.system')}</ToggleButton>
              <ToggleButton value="light">{t('settings.theme.light')}</ToggleButton>
              <ToggleButton value="dark">{t('settings.theme.dark')}</ToggleButton>
            </ToggleButtonGroup>
          </ListItem>

          {/* Sync status page, with the live pending-outbox count. */}
          <ListItem disablePadding divider>
            <ListItemButton component={Link} href="/menu/settings/sync">
              <ListItemIcon>
                <Badge badgeContent={pendingCount} color="warning">
                  <CloudSyncIcon />
                </Badge>
              </ListItemIcon>
              <ListItemText
                primary={t('settings.sync.title')}
                secondary={
                  pendingCount > 0
                    ? t('settings.sync.pending', { count: pendingCount })
                    : t('settings.sync.all_synced')
                }
              />
              <ChevronRightIcon color="action" />
            </ListItemButton>
          </ListItem>

          {/* Google account link — stub row: OAuth client not configured.
              flexWrap: the long "not configured" chip drops below the label
              on narrow viewports instead of forcing the row off-screen. */}
          <ListItem sx={{ flexWrap: 'wrap', gap: 1 }}>
            <ListItemIcon>
              <LinkOffIcon />
            </ListItemIcon>
            <ListItemText primary={t('settings.google.title')} secondary={t('settings.google.link')} />
            <Chip size="small" label={t('settings.google.not_configured')} />
          </ListItem>
        </List>
      </Paper>

      {canEditBusiness && supabase && business ? (
        <BusinessProfileCard
          supabase={supabase}
          business={business}
          onSaved={refresh}
        />
      ) : null}
    </Stack>
  );
}

interface BusinessLike {
  id: string;
  name: string;
  business_type: string;
  address: string | null;
  owner_name: string;
  invoice_prefix: string;
}

function BusinessProfileCard({
  supabase,
  business,
  onSaved,
}: {
  supabase: NonNullable<ReturnType<typeof useMembership>['supabase']>;
  business: BusinessLike;
  onSaved: () => void;
}) {
  const t = useTranslations('settings.business');
  const tAction = useTranslations('common.action');
  const [form, setForm] = useState({
    name: business.name,
    business_type: business.business_type,
    address: business.address ?? '',
    owner_name: business.owner_name,
    invoice_prefix: business.invoice_prefix,
  });
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);

  useEffect(() => {
    setForm({
      name: business.name,
      business_type: business.business_type,
      address: business.address ?? '',
      owner_name: business.owner_name,
      invoice_prefix: business.invoice_prefix,
    });
  }, [business]);

  const set = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('businesses')
        .update({
          name: form.name.trim(),
          business_type: form.business_type.trim(),
          address: form.address.trim() || null,
          owner_name: form.owner_name.trim(),
          invoice_prefix: form.invoice_prefix.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', business.id);
      if (error) {
        throw new Error(error.message);
      }
      setSnack(t('saved'));
      onSaved();
    } catch {
      setSnack(t('save_failed'));
    } finally {
      setSaving(false);
    }
  };

  const valid =
    form.name.trim().length > 0 && form.owner_name.trim().length > 0 && form.invoice_prefix.trim().length > 0;

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        {t('title')}
      </Typography>
      <Stack spacing={2}>
        <TextField label={t('name')} value={form.name} onChange={set('name')} required />
        <TextField label={t('type')} value={form.business_type} onChange={set('business_type')} />
        <TextField label={t('address')} value={form.address} onChange={set('address')} multiline minRows={2} />
        <TextField label={t('owner_name')} value={form.owner_name} onChange={set('owner_name')} required />
        <TextField
          label={t('invoice_prefix')}
          value={form.invoice_prefix}
          onChange={set('invoice_prefix')}
          required
        />
        <Box>
          <Button variant="contained" onClick={handleSave} disabled={saving || !valid}>
            {tAction('save')}
          </Button>
        </Box>
      </Stack>
      <Snackbar
        open={snack !== null}
        autoHideDuration={3000}
        onClose={() => setSnack(null)}
        message={snack ?? ''}
      />
    </Paper>
  );
}
