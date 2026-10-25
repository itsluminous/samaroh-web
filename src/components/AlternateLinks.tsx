'use client';

/**
 * `<link rel="alternate" hreflang="…">` for every app locale (plus `x-default`
 * → the default locale), pointing at the SAME page under each locale prefix.
 * The next-intl middleware already sends these as an HTTP `Link` header; this
 * mirrors them into the document so crawlers, assistive tech and the e2e
 * suite can read them from the DOM. React 19 hoists `<link>` into `<head>`.
 * The query string is intentionally dropped (`?hl=`/`?action=` are view state).
 */
import { getPathname, usePathname } from '@/i18n/navigation';
import { routing, type AppLocale } from '@/i18n/routing';

export function alternateHrefs(pathname: string): Array<{ hreflang: string; href: string }> {
  const href = (locale: AppLocale) => getPathname({ href: pathname, locale });
  return [
    ...routing.locales.map((locale) => ({ hreflang: locale, href: href(locale) })),
    { hreflang: 'x-default', href: href(routing.defaultLocale) },
  ];
}

export default function AlternateLinks() {
  const pathname = usePathname();
  return (
    <>
      {alternateHrefs(pathname).map(({ hreflang, href }) => (
        <link key={hreflang} rel="alternate" hrefLang={hreflang} href={href} />
      ))}
    </>
  );
}
