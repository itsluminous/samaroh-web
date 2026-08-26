/**
 * Guest ("try without an account") mode — cookie flag shared between the
 * browser and the middleware. While the cookie is set and no Supabase session
 * exists, the app runs entirely on the local Dexie store (see localClient.ts):
 * no data ever leaves the device. Signing in ends guest mode.
 */

export const GUEST_COOKIE = 'samaroh_guest';

/** Fixed local identifiers — valid UUIDs so shared code paths never choke. */
export const GUEST_USER_ID = '00000000-0000-4000-8000-00000000a11d';
export const GUEST_BUSINESS_ID = '00000000-0000-4000-8000-00000000b125';

export function isGuestMode(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }
  return document.cookie.split('; ').includes(`${GUEST_COOKIE}=1`);
}

export function enterGuestMode(): void {
  // 1 year; SameSite=Lax so normal navigation keeps the flag.
  document.cookie = `${GUEST_COOKIE}=1; path=/; max-age=31536000; samesite=lax`;
}

export function leaveGuestMode(): void {
  document.cookie = `${GUEST_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
