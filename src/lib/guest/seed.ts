/**
 * Seeds the guest-mode local store with the business the guest describes in
 * the create-business form (same form as the signed-up flow) plus the owner
 * membership row, mirroring what the server-backed flow creates in Postgres.
 * Idempotent: re-entering guest mode keeps existing local data.
 */
import { GUEST_BUSINESS_ID, GUEST_USER_ID } from './guest';
import { guestDb } from './localDb';

export interface GuestBusinessInput {
  name: string;
  businessType: string;
  address: string | null;
  ownerName: string;
}

export async function seedGuestBusiness(input: GuestBusinessInput): Promise<void> {
  const now = new Date().toISOString();
  const existing = await guestDb.businesses.get(GUEST_BUSINESS_ID);
  if (existing) {
    return;
  }
  await guestDb.businesses.add({
    id: GUEST_BUSINESS_ID,
    name: input.name,
    business_type: input.businessType,
    address: input.address,
    owner_name: input.ownerName,
    logo_path: null,
    currency: 'INR',
    invoice_prefix: 'INV',
    invoice_counter: 0,
    owner_user_id: GUEST_USER_ID,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });
  await guestDb.business_members.add({
    id: crypto.randomUUID(),
    business_id: GUEST_BUSINESS_ID,
    invited_email: '',
    user_id: GUEST_USER_ID,
    display_name: input.ownerName,
    is_owner: true,
    status: 'active',
    permissions: {},
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });
}

/** Whether the guest already finished the local business setup. */
export async function hasGuestBusiness(): Promise<boolean> {
  return (await guestDb.businesses.get(GUEST_BUSINESS_ID)) !== undefined;
}
