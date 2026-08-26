import type { ReactNode } from 'react';
import AppShell from '@/components/AppShell';
import GuestBanner from '@/components/GuestBanner';
import OutboxSync from '@/lib/outbox/OutboxSync';

// Route group for the signed-in app. The middleware redirects unauthenticated
// users to /sign-in (when Supabase is configured), letting guest-mode cookies
// through. OutboxSync replays queued offline writes on load and on reconnect
// (§8); GuestBanner flags local-only storage while in guest mode.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <OutboxSync />
      <GuestBanner />
      {children}
    </AppShell>
  );
}
