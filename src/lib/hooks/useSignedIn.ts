'use client';

/**
 * True only when a REAL (non-guest) Supabase session exists — the same
 * condition under which MenuIdentityRow shows its sign-out affordance. Used
 * by the menu search index to gate the sign-out entry.
 *
 * Reads the LOCAL session (no network round trip, same rationale as
 * useMembership) from the remote client — never the guest local client,
 * whose synthetic user must not look like a signed-in session.
 */
import { useEffect, useState } from 'react';
import { isGuestMode } from '@/lib/guest/guest';
import { createRemoteClient } from '@/lib/supabase/client';

export function useSignedIn(): boolean {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    // Cookie/session are read after mount so server/client renders match
    // (same pattern as MenuIdentityRow / GuestBanner).
    if (isGuestMode()) {
      return;
    }
    const supabase = createRemoteClient();
    if (!supabase) {
      return;
    }
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setSignedIn(Boolean(data.session?.user));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return signedIn;
}
