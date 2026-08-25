import { defineRouting } from 'next-intl/routing';

// v1 ships en + hi; adding a locale = new catalog file in samaroh-shared + an entry here.
export const routing = defineRouting({
  locales: ['en', 'hi'],
  defaultLocale: 'en',
  // Always prefix routes (/en/booking, /hi/booking). The middleware persists the
  // user's choice in the NEXT_LOCALE cookie and honors it on the next visit.
  localePrefix: 'always',
  localeCookie: {
    // Persist for a year so the choice survives browser restarts.
    maxAge: 60 * 60 * 24 * 365,
  },
});

export type AppLocale = (typeof routing.locales)[number];
