'use client';

import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DUPLICATE_CHIP_THRESHOLD, findSimilarItems } from '@/lib/fuzzy';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { compressImageToWebP, validateImageFile } from '@/lib/images/compress';
import {
  createMasterItem,
  updateMasterItem,
  uploadItemImage,
  type MasterItemRecord,
} from '../_lib/queries';
import { BUILT_IN_UNITS, isBuiltInUnit, unitLabelKey } from '../_lib/units';

const CUSTOM_UNIT = '__custom__';

interface MasterItemDialogProps {
  open: boolean;
  /** Present when editing. */
  item: MasterItemRecord | null;
  items: MasterItemRecord[];
  /** Signed URL of the current image (edit mode preview). */
  currentImageUrl: string | null;
  supabase: SupabaseClient | null;
  businessId: string | null;
  onClose: () => void;
  /** A fuzzy-duplicate chip was tapped — steer to that existing item. */
  onPickExisting: (item: MasterItemRecord) => void;
  onSaved: () => void;
}

/**
 * Master-item add/edit dialog (spec §4.3): name with fuzzy duplicate chips
 * (3+ chars, 40% similarity), unit dropdown with custom option, photo
 * compressed client-side to ≤320px WebP and uploaded to the private
 * `inventory-images` bucket.
 */
export default function MasterItemDialog({
  open,
  item,
  items,
  currentImageUrl,
  supabase,
  businessId,
  onClose,
  onPickExisting,
  onSaved,
}: MasterItemDialogProps) {
  const t = useTranslations('inventory.master');
  const tInventory = useTranslations('inventory');
  const tCommon = useTranslations('common');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [unitChoice, setUnitChoice] = useState<string>('pcs');
  const [customUnit, setCustomUnit] = useState('');
  const [pickedBlob, setPickedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const debouncedName = useDebouncedValue(name);

  useEffect(() => {
    if (!open) {
      return;
    }
    setName(item?.name ?? '');
    if (item && !isBuiltInUnit(item.unit)) {
      setUnitChoice(CUSTOM_UNIT);
      setCustomUnit(item.unit);
    } else {
      setUnitChoice(item?.unit ?? 'pcs');
      setCustomUnit('');
    }
    setPickedBlob(null);
    setPreviewUrl(null);
    setImageRemoved(false);
    setError(null);
    setSaving(false);
  }, [open, item]);

  useEffect(
    () => () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    },
    [previewUrl],
  );

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

  const handlePickImage = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !validateImageFile(file)) {
      return;
    }
    try {
      const blob = await compressImageToWebP(file);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPickedBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
      setImageRemoved(false);
    } catch {
      setError({ field: 'image', message: t('image_upload_failed') });
    }
  };

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
      const itemId = item?.id ?? null;
      if (itemId) {
        let imagePath = imageRemoved ? null : item!.image_path;
        if (pickedBlob) {
          imagePath = await uploadItemImage(supabase, businessId, itemId, pickedBlob);
        }
        await updateMasterItem(supabase, itemId, trimmedName, unit, imagePath);
      } else {
        const newId = await createMasterItem(supabase, businessId, trimmedName, unit, null);
        if (pickedBlob) {
          const imagePath = await uploadItemImage(supabase, businessId, newId, pickedBlob);
          await updateMasterItem(supabase, newId, trimmedName, unit, imagePath);
        }
      }
      onSaved();
    } catch {
      setError({ field: 'save', message: tInventory('error.save_failed') });
      setSaving(false);
    }
  };

  const shownImageUrl = imageRemoved ? null : (previewUrl ?? currentImageUrl);

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
          {BUILT_IN_UNITS.map((unit) => (
            <MenuItem key={unit} value={unit}>
              {t(unitLabelKey(unit))}
            </MenuItem>
          ))}
          <MenuItem value={CUSTOM_UNIT}>{t('unit_custom')}</MenuItem>
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
          <Avatar
            src={shownImageUrl ?? undefined}
            alt={name}
            variant="rounded"
            sx={{ width: 64, height: 64 }}
          >
            <PhotoCameraIcon />
          </Avatar>
          <Box>
            <Button size="small" onClick={() => fileInputRef.current?.click()}>
              {t('choose_photo')}
            </Button>
            {shownImageUrl && (
              <Button
                size="small"
                color="error"
                onClick={() => {
                  setPickedBlob(null);
                  if (previewUrl) {
                    URL.revokeObjectURL(previewUrl);
                  }
                  setPreviewUrl(null);
                  setImageRemoved(true);
                }}
              >
                {t('remove_photo')}
              </Button>
            )}
          </Box>
        </Box>
        <input
          ref={fileInputRef}
          type="file"
          hidden
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            void handlePickImage(event.target.files);
            event.target.value = '';
          }}
        />

        {(error?.field === 'image' || error?.field === 'save') && (
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
