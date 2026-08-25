/**
 * Catalog key-parity test (§5): every locale in the shared catalog must expose
 * exactly the same key set, and the generated next-intl message files must
 * mirror each other structurally. `npm test` runs gen:i18n first (pretest).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const STRINGS_DIR = join(__dirname, '..', 'shared', 'strings');
const MESSAGES_DIR = join(__dirname, '..', 'messages');

function catalogLocales(): string[] {
  return readdirSync(STRINGS_DIR)
    .map((f) => /^catalog\.([a-z]{2}(?:-[A-Za-z]+)?)\.json$/.exec(f))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => m[1] as string)
    .sort();
}

function loadCatalog(locale: string): Record<string, { value: string }> {
  return JSON.parse(readFileSync(join(STRINGS_DIR, `catalog.${locale}.json`), 'utf8'));
}

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') {
      return flattenKeys(value as Record<string, unknown>, path);
    }
    return [path];
  });
}

describe('shared string catalog', () => {
  const locales = catalogLocales();

  it('ships the v1 locales', () => {
    expect(locales).toEqual(expect.arrayContaining(['en', 'hi']));
  });

  it('has exact key parity across all locales', () => {
    const enKeys = Object.keys(loadCatalog('en')).sort();
    expect(enKeys.length).toBeGreaterThan(0);
    for (const locale of locales) {
      expect(Object.keys(loadCatalog(locale)).sort()).toEqual(enKeys);
    }
  });

  it('uses identical ICU placeholder names across locales for each key', () => {
    const placeholderNames = (value: string) =>
      [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]).sort();
    const en = loadCatalog('en');
    for (const locale of locales) {
      if (locale === 'en') {
        continue;
      }
      const other = loadCatalog(locale);
      for (const [key, entry] of Object.entries(en)) {
        expect(placeholderNames(other[key]!.value)).toEqual(placeholderNames(entry.value));
      }
    }
  });

  it('generated next-intl messages have identical structure per locale', () => {
    const keySets = locales.map((locale) => {
      const messages = JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), 'utf8'));
      return flattenKeys(messages).sort();
    });
    for (const keys of keySets) {
      expect(keys).toEqual(keySets[0]);
      expect(keys.length).toBeGreaterThan(0);
    }
  });
});
