'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import ListSubheader from '@mui/material/ListSubheader';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { DUPLICATE_CHIP_THRESHOLD, findSimilarItems } from '@/lib/fuzzy';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import {
  createMasterItem,
  updateMasterItem,
  type MasterItemRecord,
} from '../_lib/queries';
import { CUSTOM_UNIT_LABEL_KEY, isKnownUnit, UNIT_GROUPS } from '../_lib/units';
import ItemPhotoAvatar from './ItemPhotoAvatar';

const CUSTOM_UNIT = '__custom__';

interface MasterItemDialogProps {
  open: boolean;
  /** Present when editing. */
  item: MasterItemRecord | null;
  items: MasterItemRecord[];
  supabase: SupabaseClient | null;
  businessId: string | null;
  onClose: () => void;
  /** A fuzzy-duplicate chip was tapped — steer to that existing item. */
  onPickExisting: (item: MasterItemRecord) => void;
  onSaved: () => void;
}

/**
 * Master-item add/edit dialog (spec §4.3): name with fuzzy duplicate chips
 * (3+ chars, 40% similarity) and unit dropdown with custom option. The photo
 * section is read-only on web: item photos live in Google Drive and only the
 * Android app can upload them (no Drive OAuth on web; the old Storage bucket
 * is gone) — the current photo renders from `drive_image_id` with a
 * localized "add photos from the mobile app" hint. The section is the mount
 * point for a future server-side upload flow (docs/decisions.md).
 */
export default function MasterItemDialog({
  open,
  item,
  items,
  supabase,
  businessId,
  onClose,
  onPickExisting,
  onSaved,
}: MasterItemDialogProps) {
  const t = useTranslations('inventory.master');
  const tInventory = useTranslations('inventory');
  const tCommon = useTranslations('common');

  const [name, setName] = useState('');
  const [unitChoice, setUnitChoice] = useState<string>('pcs');
  const [customUnit, setCustomUnit] = useState('');
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const debouncedName = useDebouncedValue(name);

  useEffect(() => {
    if (!open) {
      return;
    }
    setName(item?.name ?? '');
    if (item && !isKnownUnit(item.unit)) {
      setUnitChoice(CUSTOM_UNIT);
      setCustomUnit(item.unit);
    } else {
      setUnitChoice(item?.unit ?? 'pcs');
      setCustomUnit('');
    }
    setError(null);
    setSaving(false);
  }, [open, item]);

  const duplicates = useMemo(
    () =>
      findSimilarItems(
        debouncedName,
        items.filter((candidate) => candidate.id !== item?.id),
        DUPLICATE_CHIP_THRESHOLD,
        5,
      ),
    [debouncedName, items, item],
  );

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (trimmedName === '') {
      setError({ field: 'name', message: t('name_required') });
      return;
    }
    if (
      items.some(
        (candidate) =>
          candidate.id !== item?.id &&
          candidate.name.toLocaleLowerCase() === trimmedName.toLocaleLowerCase(),
      )
    ) {
      setError({ field: 'name', message: t('duplicate_exists') });
      return;
    }
    const unit = unitChoice === CUSTOM_UNIT ? customUnit.trim() : unitChoice;
    if (unit === '') {
      setError({ field: 'unit', message: t('unit_required') });
      return;
    }
    if (!supabase || !businessId) {
      setError({ field: 'save', message: tInventory('error.save_failed') });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (item) {
        await updateMasterItem(supabase, item.id, trimmedName, unit);
      } else {
        await createMasterItem(supabase, businessId, trimmedName, unit);
      }
      onSaved();
    } catch {
      setError({ field: 'save', message: tInventory('error.save_failed') });
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{item ? t('edit_item') : t('add_item')}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          margin="normal"
          label={t('name_label')}
          value={name}
          error={error?.field === 'name'}
          helperText={error?.field === 'name' ? error.message : ' '}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
        />
        {duplicates.length > 0 && (
          <Box sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary" component="div">
              {t('similar_title')}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
              {duplicates.map(({ item: duplicate }) => (
                <Chip
                  key={duplicate.id}
                  size="small"
                  color="warning"
                  variant="outlined"
                  label={duplicate.name}
                  onClick={() => onPickExisting(duplicate)}
                />
              ))}
            </Box>
          </Box>
        )}

        <TextField
          select
          fullWidth
          margin="normal"
          label={t('unit_label')}
          value={unitChoice}
          onChange={(event) => {
            setUnitChoice(event.target.value);
            setError(null);
          }}
        >
          {UNIT_GROUPS.flatMap((group) => [
            <ListSubheader key={`group-${group.key}`}>{tInventory(group.labelKey)}</ListSubheader>,
            ...group.units.map((unit) => (
              <MenuItem key={unit.wire} value={unit.wire}>
                {tInventory(unit.labelKey)}
              </MenuItem>
            )),
          ])}
          <MenuItem value={CUSTOM_UNIT}>{tInventory(CUSTOM_UNIT_LABEL_KEY)}</MenuItem>
        </TextField>
        {unitChoice === CUSTOM_UNIT && (
          <TextField
            fullWidth
            margin="normal"
            label={t('custom_unit_label')}
            value={customUnit}
            error={error?.field === 'unit'}
            helperText={error?.field === 'unit' ? error.message : ' '}
            onChange={(event) => {
              setCustomUnit(event.target.value);
              setError(null);
            }}
          />
        )}

        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
          {t('photo_label')}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, my: 1 }}>
          <ItemPhotoAvatar driveImageId={item?.drive_image_id ?? null} alt={name} size={64} />
          <Typography variant="body2" color="text.secondary">
            {t('photo_mobile_hint')}
          </Typography>
        </Box>

        {error?.field === 'save' && (
          <Typography variant="body2" color="error">
            {error.message}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tCommon('action.cancel')}</Button>
        <Button variant="contained" disabled={saving} onClick={handleSave}>
          {tCommon('action.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
