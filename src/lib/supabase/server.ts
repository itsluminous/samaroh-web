import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getSupabaseEnv } from './env';

/**
 * Server-side (RSC / route handler / server action) Supabase client.
 * Returns null when the env vars are missing so callers can degrade gracefully.
 */
export async function createClient(): Promise<SupabaseClient | null> {
  const env = getSupabaseEnv();
  if (!env) {
    return null;
  }
  const cookieStore = await cookies();

  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component where cookies are read-only.
          // Safe to ignore: the middleware refreshes sessions.
        }
      },
    },
  });
}
