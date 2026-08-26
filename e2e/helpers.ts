/**
 * e2e helpers: expected UI strings come from the generated next-intl
 * catalogs (messages/{en,hi}.json) so the tests never hardcode copy and
 * stay in lockstep with the shared string catalog.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type Locale = 'en' | 'hi';

type Messages = Record<string, unknown>;

const cache = new Map<Locale, Messages>();

function messagesFor(locale: Locale): Messages {
  let messages = cache.get(locale);
  if (!messages) {
    messages = JSON.parse(readFileSync(join(__dirname, '..', 'messages', `${locale}.json`), 'utf8')) as Messages;
    cache.set(locale, messages);
  }
  return messages;
}

/** Looks up a dotted key ("common.nav.booking") in the generated catalog. */
export function msg(locale: Locale, key: string): string {
  let node: unknown = messagesFor(locale);
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) {
      break;
    }
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node !== 'string') {
    throw new Error(`missing message ${key} for ${locale}`);
  }
  return node;
}
