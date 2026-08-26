import { createServerClient } from '@supabase/ssr';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';
import { GUEST_COOKIE } from '@/lib/guest/guest';
import { getSupabaseEnv } from '@/lib/supabase/env';

const handleI18n = createIntlMiddleware(routing);

// Paths (locale-stripped) that are reachable without a session.
const PUBLIC_PATHS = ['/sign-in'];

function stripLocale(pathname: string): string {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}`) {
      return '/';
    }
    if (pathname.startsWith(`/${locale}/`)) {
      return pathname.slice(locale.length + 1);
    }
  }
  return pathname;
}

function localeOf(pathname: string): string {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) {
      return locale;
    }
  }
  return routing.defaultLocale;
}

export default async function middleware(request: NextRequest) {
  // 1. Locale negotiation / redirect / rewrite + NEXT_LOCALE cookie persistence.
  const response = handleI18n(request);

  // If i18n issued a redirect (e.g. / → /en), let it complete; the redirected
  // request passes through this middleware again for the auth check.
  if (response.headers.has('location')) {
    return response;
  }

  // 2. Session refresh + route protection — only when Supabase is configured.
  //    Without env vars the app stays fully navigable (scaffold/dev mode).
  const env = getSupabaseEnv();
  if (!env) {
    return response;
  }

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const bare = stripLocale(pathname);
  const isPublic = PUBLIC_PATHS.some((p) => bare === p || bare.startsWith(`${p}/`));
  const isGuest = request.cookies.get(GUEST_COOKIE)?.value === '1';

  // A real session supersedes guest mode — drop the stale flag so the data
  // layer switches back to Supabase.
  if (user && isGuest) {
    response.cookies.set(GUEST_COOKIE, '', { maxAge: 0, path: '/' });
  }

  if (!user && !isPublic && !isGuest) {
    const url = request.nextUrl.clone();
    url.pathname = `/${localeOf(pathname)}/sign-in`;
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Skip API routes, the non-localized auth routes (sign-out), Next.js
  // internals and static files (anything with an extension).
  matcher: ['/((?!api|auth|_next|_vercel|.*\\..*).*)'],
};
