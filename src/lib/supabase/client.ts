'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from './env';

/**
 * Browser-side Supabase client. Returns null when the env vars are missing so
 * callers can degrade gracefully (the app must build/run without Supabase).
 */
export function createClient(): SupabaseClient | null {
  const env = getSupabaseEnv();
  if (!env) {
    return null;
  }
  return createBrowserClient(env.url, env.anonKey);
}
