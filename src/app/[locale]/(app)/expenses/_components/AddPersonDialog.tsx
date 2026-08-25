'use client';

import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { DUPLICATE_CHIP_THRESHOLD, findSimilarItems } from '@/lib/fuzzy';
import { useBusiness } from '@/lib/hooks/useBusiness';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { partyInitials } from '../_lib/view';
import { createParty, type PartyRecord } from '../_lib/queries';

interface AddPersonDialogProps {
  open: boolean;
  parties: PartyRecord[];
  onClose: () => void;
  /** The user tapped a fuzzy suggestion — steer to the existing person. */
  onPickExisting: (party: PartyRecord) => void;
  onCreated: (party: PartyRecord) => void;
}

/**
 * Add-person dialog (spec §4.2): name with a 300ms-debounced fuzzy type-ahead
 * of existing parties (duplicate steering), optional phone.
 */
export default function AddPersonDialog({
  open,
  parties,
  onClose,
  onPickExisting,
  onCreated,
}: AddPersonDialogProps) {
  const t = useTranslations('expenses');
  const tCommon = useTranslations('common');
  const { supabase, businessId } = useBusiness();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const debouncedName = useDebouncedValue(name);

  const suggestions = useMemo(
    () => findSimilarItems(debouncedName, parties, DUPLICATE_CHIP_THRESHOLD, 5),
    [debouncedName, parties],
  );

  const reset = () => {
    setName('');
    setPhone('');
    setError(null);
    setSaving(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (trimmed === '') {
      setError(t('person.name_required'));
      return;
    }
    if (parties.some((p) => p.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) {
      setError(t('person.duplicate_exists'));
      return;
    }
    if (!supabase || !businessId) {
      setError(t('error.save_failed'));
      return;
    }
    setSaving(true);
    try {
      const party = await createParty(supabase, businessId, trimmed, phone || null);
      reset();
      onCreated(party);
    } catch {
      setError(t('error.save_failed'));
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('home.add_person')}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          margin="normal"
          label={t('person.name_label')}
          value={name}
          error={error !== null}
          helperText={error ?? ' '}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
        />
        {suggestions.length > 0 && (
          <>
            <Typography variant="caption" color="text.secondary">
              {t('person.suggestions_title')}
            </Typography>
            <List dense disablePadding>
              {suggestions.map(({ item }) => (
                <ListItemButton key={item.id} onClick={() => onPickExisting(item)}>
                  <ListItemAvatar>
                    <Avatar sx={{ width: 32, height: 32, fontSize: 14 }}>
                      {partyInitials(item.name)}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText primary={item.name} secondary={item.phone ?? undefined} />
                </ListItemButton>
              ))}
            </List>
          </>
        )}
        <TextField
          fullWidth
          margin="normal"
          type="tel"
          label={t('person.phone_label')}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{tCommon('action.cancel')}</Button>
        <Button variant="contained" disabled={saving} onClick={handleSave}>
          {tCommon('action.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
