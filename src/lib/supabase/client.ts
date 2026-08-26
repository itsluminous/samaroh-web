'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isGuestMode } from '@/lib/guest/guest';
import { createLocalClient } from '@/lib/guest/localClient';
import { getSupabaseEnv } from './env';

/**
 * Browser-side data client. In guest mode ("try without an account") this is
 * the on-device Dexie-backed client — no data leaves the device. Otherwise a
 * real Supabase client, or null when the env vars are missing so callers can
 * degrade gracefully (the app must build/run without Supabase).
 */
export function createClient(): SupabaseClient | null {
  if (isGuestMode()) {
    return createLocalClient();
  }
  return createRemoteClient();
}

/**
 * Always the real Supabase client (null when unconfigured) — used by the
 * sign-in/sign-up flow, which must reach the server even while the guest
 * cookie is still set.
 */
export function createRemoteClient(): SupabaseClient | null {
  const env = getSupabaseEnv();
  if (!env) {
    return null;
  }
  return createBrowserClient(env.url, env.anonKey);
}
