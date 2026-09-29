'use client';

/**
 * Owner-only restricted-folder allow-list editor (design D6 / §6 "Manage
 * access"): radio Everyone-with-Files-access vs Only-selected-members +
 * member checklist (non-owner, non-revoked members by display name). Saves
 * `folders.restricted` and the `folder_access` diff (soft links).
 */
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Typography from '@mui/material/Typography';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { fetchMembers, type MemberRecord } from '@/lib/permissions/membersRepo';
import { fetchFolderAccess, saveFolderAccess, setFolderRestricted } from '../_lib/queries';
import type { FolderAccessRecord, FolderRecord } from '../_lib/types';

export default function FolderAccessDialog({
  db,
  folder,
  userId,
  onClose,
  onSaved,
}: {
  db: SupabaseClient;
  /** null = closed. */
  folder: FolderRecord | null;
  userId: string;
  onClose: () => void;
  onSaved: (folder: FolderRecord) => void;
}) {
  const t = useTranslations('files.access');
  const tCommon = useTranslations('common');
  const tError = useTranslations('expenses.error');
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [access, setAccess] = useState<FolderAccessRecord[]>([]);
  const [restricted, setRestricted] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!folder) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    setRestricted(folder.restricted);
    (async () => {
      try {
        const [memberRows, accessRows] = await Promise.all([fetchMembers(db, folder.business_id), fetchFolderAccess(db, folder.business_id)]);
        if (cancelled) {
          return;
        }
        setMembers(memberRows.filter((m) => !m.is_owner && m.status !== 'revoked'));
        setAccess(accessRows);
        setSelected(
          new Set(accessRows.filter((a) => a.folder_id === folder.id && a.deleted_at === null).map((a) => a.member_id)),
        );
      } catch {
        if (!cancelled) {
          setLoadError(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, folder]);

  const toggleMember = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!folder) {
      return;
    }
    setSaving(true);
    try {
      let next = folder;
      if (restricted !== folder.restricted) {
        next = await setFolderRestricted(db, folder, userId, restricted);
      }
      // Unrestricted folders leave their allow-list rows untouched (inert
      // while restricted=false) so flipping back restores the previous members.
      if (restricted) {
        await saveFolderAccess(db, folder, [...selected], access);
      }
      onSaved(next);
      onClose();
    } catch {
      setLoadError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={folder !== null} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('title')}</DialogTitle>
      <DialogContent>
        {loading ? (
          <CircularProgress size={24} aria-label={tCommon('state.loading')} />
        ) : (
          <>
            {loadError ? <Alert severity="error" sx={{ mb: 1 }}>{tError('load_failed')}</Alert> : null}
            <RadioGroup value={restricted ? 'selected' : 'everyone'} onChange={(e) => setRestricted(e.target.value === 'selected')}>
              <FormControlLabel value="everyone" control={<Radio />} label={t('everyone')} />
              <FormControlLabel value="selected" control={<Radio />} label={t('only_selected')} />
            </RadioGroup>
            {restricted ? (
              members.length === 0 ? (
                <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
                  {t('no_members')}
                </Typography>
              ) : (
                <List dense disablePadding sx={{ mt: 1 }}>
                  {members.map((member) => {
                    const labelId = `folder-access-${member.id}`;
                    return (
                      <ListItem key={member.id} disablePadding>
                        <ListItemButton onClick={() => toggleMember(member.id)} dense>
                          <ListItemIcon sx={{ minWidth: 36 }}>
                            <Checkbox
                              edge="start"
                              size="small"
                              checked={selected.has(member.id)}
                              tabIndex={-1}
                              disableRipple
                              slotProps={{ input: { 'aria-labelledby': labelId } }}
                            />
                          </ListItemIcon>
                          <ListItemText id={labelId} primary={member.display_name} secondary={member.invited_email} />
                        </ListItemButton>
                      </ListItem>
                    );
                  })}
                </List>
              )
            ) : null}
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 2 }}>
              {t('subfolders_note')}
            </Typography>
            <Typography variant="caption" color="text.secondary" component="p">
              {t('owner_always')}
            </Typography>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          {tCommon('action.cancel')}
        </Button>
        <Button onClick={handleSave} variant="contained" disabled={saving || loading}>
          {tCommon('action.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
