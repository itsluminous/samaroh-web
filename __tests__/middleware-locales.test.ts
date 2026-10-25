/**
 * @jest-environment node
 *
 * next-intl middleware over the three app locales (en | hi | hi-Latn): a
 * prefixed request is served (not redirected) for each locale — including the
 * script-subtagged `hi-Latn`, which must not be confused with `hi` — the
 * unprefixed root redirects to the default locale (or the NEXT_LOCALE cookie
 * choice, so a Hinglish user comes back to Hinglish), and every response carries
 * `Link: <…>; rel="alternate"; hreflang="…"` entries for all locales + x-default.
 * Supabase is unconfigured here, so route protection is skipped by contract.
 */
import { NextRequest } from 'next/server';
import middleware from '@/middleware';
import { routing } from '@/i18n/routing';

const ORIGIN = 'http://localhost:3000';

function request(path: string, cookie?: string): NextRequest {
  return new NextRequest(`${ORIGIN}${path}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

function hreflangs(linkHeader: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (linkHeader ?? '').split(',')) {
    const m = /<([^>]+)>;\s*rel="alternate";\s*hreflang="([^"]+)"/.exec(part.trim());
    if (m) {
      out[m[2]!] = m[1]!;
    }
  }
  return out;
}

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});

describe('locale routing middleware', () => {
  it.each(routing.locales)('serves /%s/booking in place with hreflang alternates for all locales', async (locale) => {
    const response = await middleware(request(`/${locale}/booking`));
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    const alternates = hreflangs(response.headers.get('link'));
    expect(Object.keys(alternates).sort()).toEqual([...routing.locales, 'x-default'].sort());
    expect(alternates['hi-Latn']).toBe(`${ORIGIN}/hi-Latn/booking`);
    expect(alternates.hi).toBe(`${ORIGIN}/hi/booking`);
    // x-default is the unprefixed URL: it re-enters negotiation (cookie / Accept-Language).
    expect(alternates['x-default']).toBe(`${ORIGIN}/booking`);
  });

  it('remembers Hinglish: NEXT_LOCALE=hi-Latn sends the bare root to /hi-Latn', async () => {
    const response = await middleware(request('/', 'NEXT_LOCALE=hi-Latn'));
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.headers.get('location')).toBe(`${ORIGIN}/hi-Latn`);
  });

  it('a hi-Latn page refreshes the NEXT_LOCALE cookie to hi-Latn (not hi)', async () => {
    const response = await middleware(request('/hi-Latn/menu/help', 'NEXT_LOCALE=en'));
    expect(response.headers.get('set-cookie')).toMatch(/NEXT_LOCALE=hi-Latn/);
  });

  it('the bare root without a cookie redirects to the default locale', async () => {
    const response = await middleware(request('/'));
    expect(response.headers.get('location')).toBe(`${ORIGIN}/en`);
  });
});
