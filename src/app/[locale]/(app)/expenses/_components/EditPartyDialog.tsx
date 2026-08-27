'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useBusiness } from '@/lib/hooks/useBusiness';
import {
  deleteParty,
  fetchParties,
  updateParty,
  type PartyRecord,
} from '../_lib/queries';
import BusinessRelatedPill from './BusinessRelatedPill';

interface EditPartyDialogProps {
  open: boolean;
  party: PartyRecord;
  /** expenses.manage_parties — hides the destructive delete action. */
  canDelete: boolean;
  onClose: () => void;
  onSaved: (party: PartyRecord) => void;
  /** Party (and its ledger) is gone — caller navigates back to the list. */
  onDeleted: () => void;
}

/**
 * Edit-party dialog — full parity with the add-party dialog (spec §4.2):
 * name with duplicate validation against the business's other parties,
 * optional phone, and the business-association yes/no pill. Also hosts the
 * delete-party action: a confirmation warns that every ledger entry and
 * attached bill of the party is deleted too (cascade tombstone).
 */
export default function EditPartyDialog({
  open,
  party,
  canDelete,
  onClose,
  onSaved,
  onDeleted,
}: EditPartyDialogProps) {
  const t = useTranslations('expenses');
  const tCommon = useTranslations('common');
  const { supabase, businessId, businessName } = useBusiness();

  const [name, setName] = useState(party.name);
  const [phone, setPhone] = useState(party.phone ?? '');
  const [businessRelated, setBusinessRelated] = useState(party.business_related);
  const [others, setOthers] = useState<PartyRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Re-seed the fields and load the sibling parties (duplicate validation)
  // every time the dialog opens.
  useEffect(() => {
    if (!open) {
      return;
    }
    setName(party.name);
    setPhone(party.phone ?? '');
    setBusinessRelated(party.business_related);
    setError(null);
    setConfirmOpen(false);
    setBusy(false);
    if (!supabase || !businessId) {
      return;
    }
    let cancelled = false;
    void fetchParties(supabase, businessId)
      .then((rows) => {
        if (!cancelled) {
          setOthers(rows.filter((row) => row.id !== party.id));
        }
      })
      .catch(() => {
        // Duplicate steering degrades gracefully; the save itself still works.
      });
    return () => {
      cancelled = true;
    };
  }, [open, party, supabase, businessId]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (trimmed === '') {
      setError(t('person.name_required'));
      return;
    }
    if (others.some((p) => p.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) {
      setError(t('person.duplicate_exists'));
      return;
    }
    if (!supabase) {
      setError(t('error.save_failed'));
      return;
    }
    setBusy(true);
    try {
      const input = { name: trimmed, phone: phone.trim() || null, businessRelated };
      await updateParty(supabase, party.id, input);
      onSaved({ ...party, name: input.name, phone: input.phone, business_related: businessRelated });
    } catch {
      setError(t('error.save_failed'));
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!supabase) {
      setConfirmOpen(false);
      setError(t('error.save_failed'));
      return;
    }
    setBusy(true);
    try {
      await deleteParty(supabase, party);
      setConfirmOpen(false);
      onDeleted();
    } catch {
      setConfirmOpen(false);
      setError(t('error.save_failed'));
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
        <DialogTitle>{t('party.edit_title')}</DialogTitle>
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
          <TextField
            fullWidth
            margin="normal"
            type="tel"
            label={t('person.phone_label')}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
          <Box sx={{ mt: 1 }}>
            <BusinessRelatedPill
              value={businessRelated}
              onChange={setBusinessRelated}
              businessName={businessName ?? ''}
              disabled={busy}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          {canDelete ? (
            <Button color="error" disabled={busy} onClick={() => setConfirmOpen(true)} sx={{ mr: 'auto' }}>
              {t('party.delete_action')}
            </Button>
          ) : null}
          <Button disabled={busy} onClick={onClose}>
            {tCommon('action.cancel')}
          </Button>
          <Button variant="contained" disabled={busy} onClick={() => void handleSave()}>
            {tCommon('action.save')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmOpen} onClose={busy ? undefined : () => setConfirmOpen(false)} maxWidth="xs">
        <DialogTitle>{t('party.delete_confirm_title', { name: party.name })}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('party.delete_confirm_message')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setConfirmOpen(false)}>
            {tCommon('action.cancel')}
          </Button>
          <Button color="error" variant="contained" disabled={busy} onClick={() => void handleDelete()}>
            {tCommon('action.delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
