export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

/**
 * Reads the public Supabase connection settings.
 *
 * Returns null when they are not set — the app must build and run without them
 * (auth features degrade gracefully instead of crashing at import time).
 */
export function getSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return null;
  }
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseEnv() !== null;
}
