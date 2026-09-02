'use client';

/**
 * Identity row at the top of the Menu tab (§4.4): shows which account is
 * signed in — the email from the Supabase session under a localized
 * "Signed in as" label — or the localized "Not signed in" state while in
 * guest mode / without a session (owner feedback: nothing showed who is
 * signed in).
 *
 * Signed in, the row carries a sign-out icon (ADR-040 parity with Android):
 * always confirm first, and warn with the pending-outbox count when unsynced
 * changes would be left behind. Confirming posts to the non-localized
 * /auth/sign-out route (ends the session and guest mode server-side).
 */
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import LogoutIcon from '@mui/icons-material/Logout';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { isGuestMode } from '@/lib/guest/guest';
import { useOutbox } from '@/lib/outbox/useOutbox';
import { createClient, createRemoteClient } from '@/lib/supabase/client';

type Identity =
  | { kind: 'loading' }
  | { kind: 'anonymous' }
  | { kind: 'signed_in'; email: string };

export default function MenuIdentityRow() {
  const t = useTranslations();
  const [identity, setIdentity] = useState<Identity>({ kind: 'loading' });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  // Pending-outbox count for the sign-out warning (queued writes that have
  // not reached the server yet would be left behind on this device).
  const db = useMemo(() => createClient(), []);
  const { pendingCount } = useOutbox(db);

  useEffect(() => {
    // Cookie and session are read after mount so server/client renders stay
    // identical (same pattern as GuestBanner).
    if (isGuestMode()) {
      setIdentity({ kind: 'anonymous' });
      return;
    }
    // The sign-in state must reflect the real server session, never the
    // guest-mode local client — hence createRemoteClient (null when the
    // Supabase env is missing; auth features degrade gracefully).
    const supabase = createRemoteClient();
    if (!supabase) {
      setIdentity({ kind: 'anonymous' });
      return;
    }
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) {
        return;
      }
      const email = data.user?.email;
      setIdentity(email ? { kind: 'signed_in', email } : { kind: 'anonymous' });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ListItem
      divider
      sx={{ minHeight: 64 }}
      secondaryAction={
        identity.kind === 'signed_in' ? (
          <Tooltip title={t('menu.identity.sign_out')}>
            <IconButton
              edge="end"
              aria-label={t('menu.identity.sign_out')}
              onClick={() => setConfirmOpen(true)}
            >
              <LogoutIcon />
            </IconButton>
          </Tooltip>
        ) : undefined
      }
    >
      <ListItemIcon>
        <AccountCircleIcon color={identity.kind === 'signed_in' ? 'primary' : 'action'} />
      </ListItemIcon>
      {identity.kind === 'signed_in' ? (
        <ListItemText
          primary={t('menu.identity.signed_in_as')}
          secondary={identity.email}
          primaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
          secondaryTypographyProps={{ variant: 'body1', color: 'text.primary' }}
        />
      ) : identity.kind === 'anonymous' ? (
        <ListItemText primary={t('menu.identity.not_signed_in')} />
      ) : null}

      {/* Hidden form: the confirmed sign-out posts to the non-localized route. */}
      <form ref={formRef} action="/auth/sign-out" method="post" hidden />

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>{t('menu.sign_out.confirm_title')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {pendingCount > 0
              ? t('menu.sign_out.confirm_message_pending', { count: pendingCount })
              : t('menu.sign_out.confirm_message')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>{t('common.action.cancel')}</Button>
          <Button color="error" variant="contained" onClick={() => formRef.current?.submit()}>
            {t('menu.sign_out.confirm_action')}
          </Button>
        </DialogActions>
      </Dialog>
    </ListItem>
  );
}
