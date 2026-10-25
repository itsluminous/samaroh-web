/**
 * App locale → `Intl` formatting locale.
 *
 * Hinglish (`hi-Latn`) is Hindi written in Latin letters; dates and numbers in
 * that register are what an Indian English speaker writes — Latin digits,
 * English month/weekday names, Indian grouping — i.e. `en-IN`. ICU's own
 * `hi-Latn` data romanises the Hindi names instead ("Ra", "So" weekdays), and
 * browser support for the tag is uneven, so every `Intl.*` call site maps the UI
 * locale through here (docs/decisions.md, 2026-10-25). `en` and `hi` pass
 * through unchanged.
 */
const INTL_LOCALE_OVERRIDES: Readonly<Record<string, string>> = {
  'hi-Latn': 'en-IN',
};

export function intlLocale(appLocale: string): string {
  return INTL_LOCALE_OVERRIDES[appLocale] ?? appLocale;
}
