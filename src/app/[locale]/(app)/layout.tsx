import type { ReactNode } from 'react';
import AppShell from '@/components/AppShell';
import OutboxSync from '@/lib/outbox/OutboxSync';

// Route group for the signed-in app. The middleware redirects unauthenticated
// users to /sign-in (when Supabase is configured). OutboxSync replays queued
// offline writes on load and on reconnect (§8).
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <OutboxSync />
      {children}
    </AppShell>
  );
}
