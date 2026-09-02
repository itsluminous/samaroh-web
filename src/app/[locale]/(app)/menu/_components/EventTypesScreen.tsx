'use client';

/**
 * Manage event-type presets (Menu → Settings → Event types). Owner or
 * settings.manage_business only — matches the RLS write policy on the
 * event_types table (migration 006).
 *
 * List shows icon / label / default-colour dot in sort_order, with up/down
 * reorder, edit and soft-delete (with confirmation — existing bookings keep
 * their recorded label/icon snapshot). The add/edit dialog validates
 * duplicate names against the live presets (backed by the partial unique
 * index) and reuses the shared 16-swatch colour picker.
 */
import AddIcon from '@mui/icons-material/Add';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import ChipRow from '@/components/ChipRow';
import ColorSwatchPicker from '@/components/ColorSwatchPicker';
import { findBookingColor } from '@/lib/booking/bookingColors';
import type { EventTypeKind } from '@/lib/booking/eventTypes';
import {
  createEventType,
  deleteEventType,
  fetchEventTypes,
  isDuplicateLabel,
  reorderEventTypes,
  updateEventType,
  type EventTypeInput,
  type EventTypePreset,
} from '@/lib/booking/eventTypePresets';
import { useMembership } from '@/lib/permissions/useMembership';

type DialogState = { mode: 'add' } | { mode: 'edit'; preset: EventTypePreset };

export default function EventTypesScreen() {
  const t = useTranslations();
  const { supabase, business, isOwner, permissions, loading: memberLoading } = useMembership();
  const canManage = isOwner || permissions.settings.manage_business;

  const [presets, setPresets] = useState<EventTypePreset[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [deleteFor, setDeleteFor] = useState<EventTypePreset | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    if (!supabase || !business) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchEventTypes(supabase, business.id).then((p) => {
      setPresets(p);
      setLoading(false);
    });
  }, [supabase, business]);

  useEffect(() => {
    if (!memberLoading) {
      reload();
    }
  }, [memberLoading, reload]);

  if (memberLoading || loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }} aria-label={t('common.state.loading')}>
        <CircularProgress />
      </Box>
    );
  }

  if (!canManage || !supabase || !business) {
    return null;
  }

  const live = presets ?? [];

  async function handleDialogSave(input: EventTypeInput) {
    if (!supabase || !business) {
      return;
    }
    setBusy(true);
    try {
      if (dialog?.mode === 'edit') {
        await updateEventType(supabase, dialog.preset, input);
      } else {
        const nextOrder = live.reduce((max, p) => Math.max(max, p.sort_order + 1), 0);
        await createEventType(supabase, business.id, input, nextOrder);
      }
      setDialog(null);
      reload();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!supabase || !deleteFor) {
      return;
    }
    setBusy(true);
    try {
      await deleteEventType(supabase, deleteFor);
      setDeleteFor(null);
      reload();
    } finally {
      setBusy(false);
    }
  }

  async function move(index: number, delta: -1 | 1) {
    if (!supabase) {
      return;
    }
    const target = index + delta;
    if (target < 0 || target >= live.length) {
      return;
    }
    const next = [...live];
    const a = next[index] as EventTypePreset;
    next[index] = next[target] as EventTypePreset;
    next[target] = a;
    setBusy(true);
    try {
      setPresets(await reorderEventTypes(supabase, next));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack spacing={2} sx={{ maxWidth: 640 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h5" component="h1">
          {t('settings.event_types.title')}
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ mode: 'add' })}>
          {t('common.action.add')}
        </Button>
      </Box>

      {live.length === 0 ? (
        <Typography color="text.secondary">{t('settings.event_types.empty')}</Typography>
      ) : (
        <Paper variant="outlined">
          <List disablePadding>
            {live.map((preset, i) => {
              const colorDef = findBookingColor(preset.color);
              return (
                <ListItem
                  key={preset.id}
                  divider={i < live.length - 1}
                  secondaryAction={
                    <Stack direction="row" spacing={0}>
                      <IconButton
                        size="small"
                        aria-label={t('settings.event_types.move_up')}
                        disabled={busy || i === 0}
                        onClick={() => move(i, -1)}
                      >
                        <ArrowUpwardIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        aria-label={t('settings.event_types.move_down')}
                        disabled={busy || i === live.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        <ArrowDownwardIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        aria-label={t('common.action.edit')}
                        disabled={busy}
                        onClick={() => setDialog({ mode: 'edit', preset })}
                      >
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        aria-label={t('common.action.delete')}
                        disabled={busy}
                        onClick={() => setDeleteFor(preset)}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  }
                >
                  <Typography sx={{ mr: 1.5, fontSize: 20 }} component="span">
                    {preset.icon}
                  </Typography>
                  <ListItemText primary={preset.label} sx={{ pr: 14 }} />
                  {/* Marker-kind presets carry a badge (calendar-only day indicators). */}
                  {preset.kind === 'marker' ? (
                    <Chip size="small" variant="outlined" label={t('booking.marker.badge')} sx={{ mr: 1 }} />
                  ) : null}
                  {/* Default calendar colour dot (themed purple when unset). */}
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      flexShrink: 0,
                      mr: 1,
                      bgcolor: colorDef?.hex ?? 'primary.main',
                    }}
                  />
                </ListItem>
              );
            })}
          </List>
        </Paper>
      )}

      {dialog ? (
        <EventTypeDialog
          mode={dialog.mode}
          preset={dialog.mode === 'edit' ? dialog.preset : null}
          presets={live}
          busy={busy}
          onSave={handleDialogSave}
          onClose={() => setDialog(null)}
        />
      ) : null}

      <Dialog open={deleteFor !== null} onClose={() => setDeleteFor(null)}>
        <DialogTitle>{t('settings.event_types.delete_title')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('settings.event_types.delete_message', { label: deleteFor?.label ?? '' })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteFor(null)}>{t('common.action.cancel')}</Button>
          <Button color="error" onClick={handleDelete} disabled={busy}>
            {t('common.action.delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

/** Add/edit dialog — exported for tests. */
export function EventTypeDialog({
  mode,
  preset,
  presets,
  busy,
  onSave,
  onClose,
}: {
  mode: 'add' | 'edit';
  preset: EventTypePreset | null;
  /** Live presets, for duplicate-name validation. */
  presets: EventTypePreset[];
  busy?: boolean;
  onSave: (input: EventTypeInput) => void;
  onClose: () => void;
}) {
  const t = useTranslations();
  const [label, setLabel] = useState(preset?.label ?? '');
  const [icon, setIcon] = useState(preset?.icon ?? '\u2728');
  const [color, setColor] = useState<string | null>(preset?.color ?? null);
  const [kind, setKind] = useState<EventTypeKind>(preset?.kind ?? 'booking');

  const duplicate = isDuplicateLabel(presets, label, preset?.id);
  const valid = label.trim() !== '' && !duplicate;

  const kinds: EventTypeKind[] = ['booking', 'marker'];

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        {mode === 'edit' ? t('settings.event_types.edit_title') : t('settings.event_types.add_title')}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Stack direction="row" spacing={1}>
            <TextField
              label={t('settings.event_types.icon_label')}
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              sx={{ width: 96 }}
              inputProps={{ maxLength: 4 }}
            />
            <TextField
              label={t('settings.event_types.name_label')}
              value={label}
              required
              error={duplicate}
              helperText={duplicate ? t('settings.event_types.duplicate_name') : undefined}
              onChange={(e) => setLabel(e.target.value)}
              fullWidth
            />
          </Stack>
          {/* Kind: booking vs marker — same pill-row UX as confirmed/tentative. */}
          <Box>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>
              {t('settings.event_types.kind_label')}
            </Typography>
            <ChipRow>
              {kinds.map((k) => (
                <Chip
                  key={k}
                  label={t(`settings.event_types.kind_${k}`)}
                  color={kind === k ? 'primary' : 'default'}
                  variant={kind === k ? 'filled' : 'outlined'}
                  onClick={() => setKind(k)}
                />
              ))}
            </ChipRow>
            {kind === 'marker' ? (
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
                {t('settings.event_types.kind_marker_hint')}
              </Typography>
            ) : null}
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>
              {t('settings.event_types.color_label')}
            </Typography>
            <ColorSwatchPicker
              label={t('settings.event_types.color_label')}
              value={color}
              onChange={setColor}
            />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.action.cancel')}</Button>
        <Button
          variant="contained"
          disabled={!valid || busy === true}
          onClick={() => onSave({ label: label.trim(), icon: icon.trim() || '\u2728', color, kind })}
        >
          {t('common.action.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
