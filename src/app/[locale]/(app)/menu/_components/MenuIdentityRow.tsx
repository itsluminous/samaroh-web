'use client';

/**
 * Identity row at the top of the Menu tab (§4.4): shows which account is
 * signed in — the email from the Supabase session under a localized
 * "Signed in as" label — or the localized "Not signed in" state while in
 * guest mode / without a session (owner feedback: nothing showed who is
 * signed in).
 */
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { isGuestMode } from '@/lib/guest/guest';
import { createRemoteClient } from '@/lib/supabase/client';

type Identity =
  | { kind: 'loading' }
  | { kind: 'anonymous' }
  | { kind: 'signed_in'; email: string };

export default function MenuIdentityRow() {
  const t = useTranslations('menu.identity');
  const [identity, setIdentity] = useState<Identity>({ kind: 'loading' });

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
    <ListItem divider sx={{ minHeight: 64 }}>
      <ListItemIcon>
        <AccountCircleIcon color={identity.kind === 'signed_in' ? 'primary' : 'action'} />
      </ListItemIcon>
      {identity.kind === 'signed_in' ? (
        <ListItemText
          primary={t('signed_in_as')}
          secondary={identity.email}
          primaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
          secondaryTypographyProps={{ variant: 'body1', color: 'text.primary' }}
        />
      ) : identity.kind === 'anonymous' ? (
        <ListItemText primary={t('not_signed_in')} />
      ) : null}
    </ListItem>
  );
}
