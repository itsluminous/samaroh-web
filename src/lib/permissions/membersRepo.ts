/**
 * Data access for the Members section (owner only, §4.4). Members live in
 * business_members: invited by email, activated when the invitee signs in,
 * revoked as a status transition (rows are never hard-deleted). Permission
 * blobs follow shared/permissions/permissions-schema.json.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MemberPermissions } from './permissions';

export type MemberStatus = 'invited' | 'active' | 'revoked';

export interface MemberRecord {
  id: string;
  invited_email: string;
  user_id: string | null;
  display_name: string;
  is_owner: boolean;
  status: MemberStatus;
  permissions: unknown;
  updated_at: string;
}

const MEMBER_COLUMNS = 'id, invited_email, user_id, display_name, is_owner, status, permissions, updated_at';

export async function fetchMembers(db: SupabaseClient, businessId: string): Promise<MemberRecord[]> {
  const { data, error } = await db
    .from('business_members')
    .select(MEMBER_COLUMNS)
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .order('is_owner', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as MemberRecord[];
}

export async function addMember(
  db: SupabaseClient,
  businessId: string,
  input: { email: string; displayName: string; permissions: MemberPermissions },
): Promise<void> {
  const { error } = await db.from('business_members').insert({
    id: crypto.randomUUID(),
    business_id: businessId,
    invited_email: input.email.trim().toLowerCase(),
    display_name: input.displayName.trim(),
    status: 'invited' satisfies MemberStatus,
    permissions: input.permissions,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function updateMember(
  db: SupabaseClient,
  memberId: string,
  patch: { display_name?: string; permissions?: MemberPermissions; status?: MemberStatus },
): Promise<void> {
  const { error } = await db
    .from('business_members')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', memberId);
  if (error) {
    throw new Error(error.message);
  }
}

/** Revoke = status transition; the row (and its audit trail) stays. */
export async function revokeMember(db: SupabaseClient, member: MemberRecord): Promise<void> {
  await updateMember(db, member.id, { status: 'revoked' });
}

/** Restore a revoked member: active if they ever signed in, else re-invited. */
export async function reactivateMember(db: SupabaseClient, member: MemberRecord): Promise<void> {
  await updateMember(db, member.id, { status: member.user_id ? 'active' : 'invited' });
}
