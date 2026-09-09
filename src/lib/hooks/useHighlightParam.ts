'use client';

/**
 * Scroll-to/highlight support for menu-search navigation: a search result
 * whose destination is a ROW on a page (not a page of its own) navigates
 * with `?hl=<anchor>`; the target screen calls this hook, gives the row
 * `id="hl-<anchor>"`, and applies {@link highlightSx} while the returned
 * value matches.
 *
 * The param is read from `window.location` once on mount (client-only) —
 * deliberately NOT `useSearchParams()`, which would force a Suspense/CSR
 * bailout on these statically prerendered pages. The highlight clears
 * itself after a short beat.
 */
import type { SxProps, Theme } from '@mui/material/styles';
import { useEffect, useState } from 'react';

/** How long the row stays tinted (ms). */
const HIGHLIGHT_MS = 2400;

/** Temporary tint for the targeted row (plain object so callers can spread it). */
export const highlightSx = {
  bgcolor: 'action.selected',
  transition: 'background-color 400ms',
} as const satisfies SxProps<Theme>;

export function useHighlightParam(validAnchors: readonly string[]): string | null {
  const [anchor, setAnchor] = useState<string | null>(null);

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('hl');
    if (!param || !validAnchors.includes(param)) {
      return;
    }
    setAnchor(param);
    document.getElementById(`hl-${param}`)?.scrollIntoView({ block: 'center' });
    const timer = setTimeout(() => setAnchor(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
    // Read once on mount by design — the param only changes with navigation,
    // which remounts the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return anchor;
}
