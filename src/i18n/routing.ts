import { defineRouting } from 'next-intl/routing';

// Locales ship as catalog files in samaroh-shared (strings/catalog.<locale>.json);
// adding one = new catalog there + an entry here. `hi-Latn` is Hinglish (Hindi in
// Latin script) — the BCP-47 tag chosen in shared docs/hinglish.md. Keep the
// longer `hi-Latn` AFTER `hi`: anything matching prefixes must compare whole
// segments (`/hi/` vs `/hi-Latn/`), never `startsWith('hi')`.
export const routing = defineRouting({
  locales: ['en', 'hi', 'hi-Latn'],
  defaultLocale: 'en',
  // Always prefix routes (/en/booking, /hi/booking, /hi-Latn/booking). The
  // middleware persists the user's choice in the NEXT_LOCALE cookie and honors
  // it on the next visit.
  localePrefix: 'always',
  localeCookie: {
    // Persist for a year so the choice survives browser restarts.
    maxAge: 60 * 60 * 24 * 365,
  },
});

export type AppLocale = (typeof routing.locales)[number];

/**
 * Catalog key suffix naming a locale (`settings.language.name_<suffix>`,
 * `common.language.<suffix>`): keys are snake_case, so the BCP-47 hyphen
 * becomes an underscore and the script subtag is lower-cased
 * (`hi-Latn` → `hi_latn`, matching the shared catalog).
 */
export function localeKeySuffix(locale: string): string {
  return locale.toLowerCase().replace(/-/g, '_');
}
