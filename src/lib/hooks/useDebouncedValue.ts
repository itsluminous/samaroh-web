'use client';

import { useEffect, useState } from 'react';

/** Default debounce for type-ahead suggestion fields (spec §4.2/§4.3). */
export const TYPE_AHEAD_DEBOUNCE_MS = 300;

/** Returns `value` after it has been stable for `delayMs` (300ms default). */
export function useDebouncedValue<T>(value: T, delayMs: number = TYPE_AHEAD_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
