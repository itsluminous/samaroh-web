import { routing } from './routing';

// Whole-segment locale matching on a pathname. `/hi-Latn/booking` must never be
// read as locale `hi` (a `startsWith('/hi')` check would), so each locale is
// compared against the first path segment exactly.

function firstSegment(pathname: string): string {
  const rest = pathname.startsWith('/') ? pathname.slice(1) : pathname;
  const slash = rest.indexOf('/');
  return slash === -1 ? rest : rest.slice(0, slash);
}

/** `/hi-Latn/booking` → `/booking`; `/en` → `/`; unprefixed paths pass through. */
export function stripLocale(pathname: string): string {
  const segment = firstSegment(pathname);
  if (!(routing.locales as readonly string[]).includes(segment)) {
    return pathname;
  }
  const rest = pathname.slice(segment.length + 1);
  return rest.length === 0 ? '/' : rest;
}

/** Locale of a prefixed pathname, or the default locale when unprefixed. */
export function localeOf(pathname: string): string {
  const segment = firstSegment(pathname);
  return (routing.locales as readonly string[]).includes(segment) ? segment : routing.defaultLocale;
}
