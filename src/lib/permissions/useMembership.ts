'use client';

/**
 * Resolves the signed-in member's business, ownership and the full normalized
 * permission set (shared/permissions/permissions-schema.json). Menu pages use
 * this to gate owner-only sections (Members) and `reports.view`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Business } from '@/lib/booking/types';
import { createClient } from '@/lib/supabase/client';
import type { MemberPermissions } from './permissions';
import { emptyPermissions, normalizePermissions } from './permissions';

export interface Membership {
  supabase: SupabaseClient | null;
  business: Business | null;
  userId: string | null;
  isOwner: boolean;
  /** Normalized permission set; owners get every action implicitly. */
  permissions: MemberPermissions;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

function ownerPermissions(): MemberPermissions {
  const p = emptyPermissions();
  for (const mod of Object.values(p)) {
    for (const key of Object.keys(mod)) {
      (mod as Record<string, boolean>)[key] = true;
    }
  }
  return p;
}

export function useMembership(): Membership {
  const supabase = useMemo(() => createClient(), []);
  const [business, setBusiness] = useState<Business | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [permissions, setPermissions] = useState<MemberPermissions>(emptyPermissions());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Resolve the user id from the LOCAL session first (no network round
      // trip — auth.getUser() validates against the auth server and fails on
      // flaky networks, silently hiding owner-only UI like the Members row).
      // RLS enforces the real boundary, so an unvalidated id is fine for UI
      // gating. Guest mode's local client has no session — its getUser() is
      // local and infallible, so it stays as the fallback.
      const { data: sessionData } = await supabase.auth.getSession();
      let uid = sessionData.session?.user.id ?? null;
      if (!uid) {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (cancelled) {
          return;
        }
        if (authError || !auth.user) {
          setError(authError?.message ?? 'no session');
          setLoading(false);
          return;
        }
        uid = auth.user.id;
      }
      if (cancelled) {
        return;
      }
      setUserId(uid);
      const { data: businesses, error: bizError } = await supabase
        .from('businesses')
        .select(
          'id, name, business_type, address, owner_name, logo_path, invoice_prefix, invoice_counter, owner_user_id',
        )
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      if (cancelled) {
        return;
      }
      if (bizError || !businesses || businesses.length === 0) {
        setError(bizError?.message ?? 'no business');
        setLoading(false);
        return;
      }
      // Prefer the business this user OWNS: a user who is also a member of
      // someone else's (earlier-created) business must not have their
      // owner-only UI (Members) gated on the wrong business.
      const rows = businesses as Business[];
      const biz = rows.find((b) => b.owner_user_id === uid) ?? (rows[0] as Business);
      setBusiness(biz);
      const owner = biz.owner_user_id === uid;
      setIsOwner(owner);
      if (owner) {
        setPermissions(ownerPermissions());
      } else {
        const { data: member } = await supabase
          .from('business_members')
          .select('permissions, is_owner')
          .eq('business_id', biz.id)
          .eq('user_id', uid)
          .eq('status', 'active')
          .is('deleted_at', null)
          .maybeSingle();
        if (cancelled) {
          return;
        }
        if (member?.is_owner === true) {
          setIsOwner(true);
          setPermissions(ownerPermissions());
        } else {
          setPermissions(normalizePermissions(member?.permissions));
        }
      }
      setError(null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, nonce]);

  return { supabase, business, userId, isOwner, permissions, loading, error, refresh };
}
