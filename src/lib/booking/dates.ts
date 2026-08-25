// Locale-aware date/time formatting for the Booking section and invoices.
// ISO date strings in, locale-formatted display strings out (Intl-backed).

const EN_DASH = '\u2013';

/** "2026-07-10" → "10 Jul 2026" (en) / "10 जुल॰ 2026" (hi). */
export function formatDate(iso: string, locale: string): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Single date, or "start – end" with an en dash for multi-day ranges. */
export function formatDateRange(startIso: string, endIso: string, locale: string): string {
  if (startIso === endIso) {
    return formatDate(startIso, locale);
  }
  return `${formatDate(startIso, locale)} ${EN_DASH} ${formatDate(endIso, locale)}`;
}

/** "14:30" / "14:30:00" → locale time like "2:30 pm". Null-safe. */
export function formatTime(time: string | null, locale: string): string | null {
  if (!time) {
    return null;
  }
  const h = Number(time.slice(0, 2));
  const min = Number(time.slice(3, 5));
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2000, 0, 1, h, min)));
}

/** Localized standalone month name for the calendar header / month picker. */
export function formatMonthName(month0: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2000, month0, 1)),
  );
}

/** Localized narrow weekday names, Sunday first (matches the grid). */
export function weekdayNarrowNames(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' });
  // 2023-01-01 was a Sunday.
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2023, 0, 1 + i))));
}
