import { redirect } from '@/i18n/navigation';
import { resolveLandingHref } from '@/lib/permissions/landing';
import { createClient } from '@/lib/supabase/server';

export default async function LocaleIndexPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  // The Booking tab is the home section (§4.1) — but a member without
  // booking.view lands on their first visible section instead (§3), since
  // Booking is hidden from their nav and would show the no-access state.
  const db = await createClient();
  const href = await resolveLandingHref(db);
  redirect({ href, locale });
}
