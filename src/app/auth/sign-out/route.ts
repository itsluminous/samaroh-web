import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';

// Non-localized (excluded from the i18n middleware matcher). The app shell
// posts here; we end the session and bounce back to the localized sign-in page.
export async function POST(request: Request) {
  const supabase = await createClient();
  if (supabase) {
    await supabase.auth.signOut();
  }

  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;
  const locale = hasLocale(routing.locales, cookieLocale) ? cookieLocale : routing.defaultLocale;

  return NextResponse.redirect(new URL(`/${locale}/sign-in`, request.url), 303);
}
