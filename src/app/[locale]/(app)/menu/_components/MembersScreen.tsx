'use client';

/**
 * Members screen (§4.4, owner only): member list with status chips
 * (Invited / Active / Revoked), add-by-email dialog with display name +
 * permission matrix, tap-to-edit, revoke with confirmation, restore.
 * Non-owners get the owner-only notice (the row is also hidden from their
 * Menu; RLS enforces the real boundary).
 */
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import {
  addMember,
  fetchMembers,
  reactivateMember,
  revokeMember,
  updateMember,
  type MemberRecord,
} from '@/lib/permissions/membersRepo';
import type { MemberPermissions } from '@/lib/permissions/permissions';
import { normalizePermissions, presetPermissions } from '@/lib/permissions/permissions';
import { useMembership } from '@/lib/permissions/useMembership';
import PermissionMatrixEditor from './PermissionMatrixEditor';

export default function MembersScreen() {
  const t = useTranslations();
  const { supabase, business, isOwner, loading: memberLoading } = useMembership();

  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<MemberRecord | null>(null);
  const [revoking, setRevoking] = useState<MemberRecord | null>(null);

  const reload = useCallback(async () => {
    if (!supabase || !business) {
      setLoading(false);
      return;
    }
    try {
      setMembers(await fetchMembers(supabase, business.id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [supabase, business]);

  useEffect(() => {
    if (!memberLoading && isOwner) {
      void reload();
    } else if (!memberLoading) {
      setLoading(false);
    }
  }, [memberLoading, isOwner, reload]);

  if (memberLoading || loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!isOwner) {
    return <Alert severity="warning">{t('menu.members.owner_only')}</Alert>;
  }
  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  const statusChip = (member: MemberRecord) => {
    if (member.status === 'active') {
      return <Chip size="small" color="success" label={t('menu.members.status_active')} />;
    }
    if (member.status === 'revoked') {
      return <Chip size="small" color="default" label={t('menu.members.status_revoked')} />;
    }
    return <Chip size="small" color="info" label={t('menu.members.status_invited')} />;
  };

  const employees = members.filter((m) => !m.is_owner);
  const owners = members.filter((m) => m.is_owner);

  return (
    <Stack spacing={3} sx={{ maxWidth: 640 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h5" component="h1">
          {t('menu.members.title')}
        </Typography>
        <Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => setAddOpen(true)}>
          {t('menu.members.add')}
        </Button>
      </Stack>

      {employees.length === 0 ? (
        <Alert severity="info">
          <Typography variant="subtitle2">{t('menu.members.empty_title')}</Typography>
          {t('menu.members.empty_message')}
        </Alert>
      ) : null}

      <Paper variant="outlined">
        <List disablePadding>
          {owners.map((member) => (
            <ListItem key={member.id} divider>
              <ListItemText primary={member.display_name} secondary={member.invited_email} />
              <Chip size="small" color="primary" label={t('menu.members.owner_badge')} />
            </ListItem>
          ))}
          {employees.map((member) => (
            <ListItem key={member.id} disablePadding divider>
              <ListItemButton onClick={() => setEditing(member)}>
                <ListItemText primary={member.display_name} secondary={member.invited_email} />
                {statusChip(member)}
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Paper>

      {addOpen && supabase && business ? (
        <MemberDialog
          title={t('menu.members.add')}
          initialEmail=""
          initialName=""
          initialPermissions={presetPermissions('staff')}
          emailEditable
          onSave={async (email, name, permissions) => {
            try {
              await addMember(supabase, business.id, { email, displayName: name, permissions });
              setSnack(t('menu.members.saved'));
              setAddOpen(false);
              void reload();
            } catch {
              setSnack(t('menu.members.save_failed'));
            }
          }}
          onClose={() => setAddOpen(false)}
        />
      ) : null}

      {editing && supabase ? (
        <MemberDialog
          title={t('menu.members.edit_title')}
          initialEmail={editing.invited_email}
          initialName={editing.display_name}
          initialPermissions={normalizePermissions(editing.permissions)}
          emailEditable={false}
          revoked={editing.status === 'revoked'}
          onRevoke={() => {
            setRevoking(editing);
            setEditing(null);
          }}
          onReactivate={async () => {
            try {
              await reactivateMember(supabase, editing);
              setSnack(t('menu.members.saved'));
              setEditing(null);
              void reload();
            } catch {
              setSnack(t('menu.members.save_failed'));
            }
          }}
          onSave={async (_email, name, permissions) => {
            try {
              await updateMember(supabase, editing.id, { display_name: name, permissions });
              setSnack(t('menu.members.saved'));
              setEditing(null);
              void reload();
            } catch {
              setSnack(t('menu.members.save_failed'));
            }
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {revoking && supabase ? (
        <Dialog open onClose={() => setRevoking(null)}>
          <DialogTitle>{t('menu.members.revoke_confirm_title')}</DialogTitle>
          <DialogContent>
            {t('menu.members.revoke_confirm_message', { name: revoking.display_name })}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRevoking(null)}>{t('common.action.cancel')}</Button>
            <Button
              color="error"
              variant="contained"
              onClick={async () => {
                try {
                  await revokeMember(supabase, revoking);
                  setSnack(t('menu.members.saved'));
                  void reload();
                } catch {
                  setSnack(t('menu.members.save_failed'));
                } finally {
                  setRevoking(null);
                }
              }}
            >
              {t('menu.members.revoke')}
            </Button>
          </DialogActions>
        </Dialog>
      ) : null}

      <Snackbar open={snack !== null} autoHideDuration={3000} onClose={() => setSnack(null)} message={snack ?? ''} />
    </Stack>
  );
}

function MemberDialog({
  title,
  initialEmail,
  initialName,
  initialPermissions,
  emailEditable,
  revoked = false,
  onSave,
  onRevoke,
  onReactivate,
  onClose,
}: {
  title: string;
  initialEmail: string;
  initialName: string;
  initialPermissions: MemberPermissions;
  emailEditable: boolean;
  revoked?: boolean;
  onSave: (email: string, name: string, permissions: MemberPermissions) => Promise<void>;
  onRevoke?: () => void;
  onReactivate?: () => Promise<void>;
  onClose: () => void;
}) {
  const t = useTranslations();
  const [email, setEmail] = useState(initialEmail);
  const [name, setName] = useState(initialName);
  const [permissions, setPermissions] = useState<MemberPermissions>(initialPermissions);
  const [saving, setSaving] = useState(false);

  const valid = /.+@.+\..+/.test(email.trim()) && name.trim().length > 0;

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            type="email"
            label={t('menu.members.email_label')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!emailEditable}
            required
          />
          <TextField
            label={t('menu.members.name_label')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Box>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              {t('menu.members.permissions_title')}
            </Typography>
            <PermissionMatrixEditor value={permissions} onChange={setPermissions} />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        {onRevoke && !revoked ? (
          <Button color="error" onClick={onRevoke}>
            {t('menu.members.revoke')}
          </Button>
        ) : null}
        {onReactivate && revoked ? (
          <Button color="success" onClick={() => void onReactivate()}>
            {t('menu.members.reactivate')}
          </Button>
        ) : null}
        <Box sx={{ flexGrow: 1 }} />
        <Button onClick={onClose}>{t('common.action.cancel')}</Button>
        <Button
          variant="contained"
          disabled={!valid || saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(email.trim(), name.trim(), permissions);
            } finally {
              setSaving(false);
            }
          }}
        >
          {t('common.action.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
