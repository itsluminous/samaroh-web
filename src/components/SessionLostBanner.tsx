'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { isGuestMode } from '@/lib/guest/guest';
import { replayOutbox } from '@/lib/outbox/outbox';
import { createRemoteClient } from '@/lib/supabase/client';

/**
 * Persistent banner shown when a signed-in (non-guest) tab LOSES its Supabase
 * session mid-use — the refresh token was revoked or expired, so supabase-js
 * dropped the session and every write would now run as `anon` (RLS 42501).
 * Android ADR-089 parity: the outbox replay refuses to run without a session
 * and this banner says why and offers the way back in. The middleware covers
 * the next navigation (redirect to /sign-in); this covers the current page.
 *
 * Hidden in guest mode (GuestBanner owns that state) and when Supabase is not
 * configured. Disappears — and replays the held queue — the moment a session
 * returns (sign-in in another tab, for example).
 */
export default function SessionLostBanner() {
  const t = useTranslations();
  const [lost, setLost] = useState(false);

  useEffect(() => {
    // Cookie/session are read after mount so server/client renders match
    // (same pattern as GuestBanner / MenuIdentityRow).
    if (isGuestMode()) {
      return;
    }
    const supabase = createRemoteClient();
    if (!supabase) {
      return;
    }
    let cancelled = false;
    // A tab restored without a session (the middleware normally redirects,
    // but a long-lived page may outlive its cookie) is a lost session too.
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && !data.session) {
        setLost(true);
      }
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setLost(true);
      } else if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        setLost((wasLost) => {
          if (wasLost) {
            // Self-heal: the held queue drains without any user action.
            void replayOutbox(supabase);
          }
          return false;
        });
      }
    });
    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  if (!lost) {
    return null;
  }

  return (
    <Box
      role="alert"
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1.5,
        flexWrap: 'wrap',
        px: 2,
        py: 0.5,
        mb: 2,
        borderRadius: 2,
        bgcolor: 'error.light',
        color: 'error.contrastText',
      }}
    >
      <Typography variant="body2">{t('auth.session_lost.banner')}</Typography>
      <Button component={Link} href="/sign-in" size="small" color="inherit" variant="outlined">
        {t('auth.session_lost.sign_in')}
      </Button>
    </Box>
  );
}
