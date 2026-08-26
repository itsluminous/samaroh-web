'use client';

/**
 * Invisible client component that drives outbox replay: once on app load and
 * again whenever the browser comes back online (spec §8 — push pending local
 * edits without blocking the UI). Mounted in the signed-in app layout.
 */
import { useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { replayOutbox } from './outbox';

export default function OutboxSync() {
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!supabase) {
      return;
    }
    // Replay on load (there may be edits queued from a previous session).
    void replayOutbox(supabase);
    const onOnline = () => void replayOutbox(supabase);
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [supabase]);

  return null;
}
