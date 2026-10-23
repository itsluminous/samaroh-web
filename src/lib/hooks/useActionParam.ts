'use client';

/**
 * "Show me" deep links from the Help page (src/lib/help/guide.ts
 * SHOW_ME_ACTIONS): where Android opens a sheet, the web navigates to the
 * owning page with `?action=<id>` and the page opens the same dialog once it
 * is ready. Read from `window.location` once on mount — deliberately NOT
 * `useSearchParams()`, which would force a CSR bailout on these statically
 * prerendered pages (same reasoning as useHighlightParam).
 *
 * The caller passes the action it handles and gets `true` exactly once per
 * mount while it is `ready` (its data/permissions resolved); the screen then
 * opens the dialog. The param is dropped from the URL so a reload or back
 * navigation does not reopen it. Permission is the caller's job: an action the
 * member may not perform must simply be ignored (hide, never grey).
 */
import { useEffect, useRef } from 'react';
import type { ShowMeAction } from '@/lib/help/guide';

export function useActionParam(action: ShowMeAction, ready: boolean, onAction: () => void): void {
  const fired = useRef(false);
  useEffect(() => {
    if (!ready || fired.current) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') !== action) {
      return;
    }
    fired.current = true;
    params.delete('action');
    const search = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${search ? `?${search}` : ''}`);
    onAction();
    // `onAction` is a setter closure; re-running on identity changes would
    // only be guarded by `fired` anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, ready]);
}
