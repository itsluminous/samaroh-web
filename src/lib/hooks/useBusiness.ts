'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface BusinessContextValue {
  /** Guarded browser Supabase client — null when env vars are missing. */
  supabase: SupabaseClient | null;
  /** Active business id (first membership; multi-business switcher is Menu scope). */
  businessId: string | null;
  /** Signed-in user id, needed for `created_by` columns. */
  userId: string | null;
  loading: boolean;
  error: string | null;
}

/**
 * Resolves the signed-in user's business. RLS already restricts `businesses`
 * to rows the user can see, so the first (oldest) row is the active business.
 */
export function useBusiness(): BusinessContextValue {
  const supabase = useMemo(() => createClient(), []);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (cancelled) {
        return;
      }
      if (userError || !userData.user) {
        setError(userError?.message ?? 'no session');
        setLoading(false);
        return;
      }
      setUserId(userData.user.id);
      const { data, error: bizError } = await supabase
        .from('businesses')
        .select('id')
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(1);
      if (cancelled) {
        return;
      }
      if (bizError) {
        setError(bizError.message);
      } else {
        setBusinessId((data?.[0] as { id: string } | undefined)?.id ?? null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  return { supabase, businessId, userId, loading, error };
}
