/**
 * Server-side landing resolution for the locale root. Mirrors
 * `useMembership`'s ownership/permission resolution so the root redirect
 * lands on the first section the member can actually see (a member without
 * `booking.view` must not land on the hidden Booking tab). Every degraded
 * path (no Supabase, no session — incl. guest mode, no business, query
 * failure) falls back to `/booking`, the §4.1 home tab.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizePermissions } from './permissions';
import { firstVisibleSection } from './visibility';

const HOME = '/booking';

export async function resolveLandingHref(db: SupabaseClient | null): Promise<string> {
  if (!db) {
    return HOME;
  }
  try {
    const { data: auth } = await db.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) {
      return HOME;
    }
    const { data: businesses } = await db
      .from('businesses')
      .select('id, owner_user_id')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1);
    const biz = businesses?.[0] as { id: string; owner_user_id: string } | undefined;
    if (!biz || biz.owner_user_id === userId) {
      return HOME;
    }
    const { data: member } = await db
      .from('business_members')
      .select('permissions, is_owner')
      .eq('business_id', biz.id)
      .eq('user_id', userId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .maybeSingle();
    if (member?.is_owner === true) {
      return HOME;
    }
    return firstVisibleSection(normalizePermissions(member?.permissions), false);
  } catch {
    return HOME;
  }
}
