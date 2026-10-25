'use client';

/**
 * Drop-in replacement for next-intl's `useFormatter()` that formats with the
 * app's Intl locale mapping (`intlLocale`): the UI language stays `hi-Latn`
 * for messages while dates/numbers render as `en-IN`. Use this instead of
 * `useFormatter` from next-intl anywhere `format.dateTime` / `format.number` /
 * `format.relativeTime` is called — ESLint cannot catch a stray import, so
 * grep before adding a new formatting call site.
 */
import { createFormatter, useLocale, useTimeZone } from 'next-intl';
import { useMemo } from 'react';
import { intlLocale } from './intlLocale';

export function useAppFormatter(): ReturnType<typeof createFormatter> {
  const locale = useLocale();
  const timeZone = useTimeZone();
  return useMemo(() => createFormatter({ locale: intlLocale(locale), timeZone }), [locale, timeZone]);
}
