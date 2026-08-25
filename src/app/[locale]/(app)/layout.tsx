import type { ReactNode } from 'react';
import AppShell from '@/components/AppShell';

// Route group for the signed-in app. The middleware redirects unauthenticated
// users to /sign-in (when Supabase is configured).
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
