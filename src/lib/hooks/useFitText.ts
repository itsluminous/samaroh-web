'use client';

import { useLayoutEffect, useRef } from 'react';

/**
 * Never scale below this fraction of the inherited font-size — past it the
 * text is unreadably small, so the element's ellipsis takes over instead.
 */
export const MIN_FIT_SCALE = 0.65;

/**
 * Fits a single line of text into its container by shrinking the font-size
 * instead of wrapping or hard-truncating: after layout it measures
 * `scrollWidth` vs `clientWidth` and, when the text would overflow, scales
 * the font down proportionally, floored at {@link MIN_FIT_SCALE} of the
 * inherited size (same measure-and-scale approach as the report-amount
 * AutoShrinkText). Beyond the floor the caller's `text-overflow: ellipsis`
 * applies. Re-measures on container resizes via ResizeObserver, always
 * starting from the inherited size so repeated fits never compound and
 * growing the container restores the full size.
 *
 * The caller must style the element single-line (`white-space: nowrap`,
 * `overflow: hidden`, ideally `text-overflow: ellipsis`) and attach the
 * returned ref.
 */
export function useFitText<T extends HTMLElement>(text: string): React.RefObject<T | null> {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const fit = () => {
      // Reset to the inherited size before measuring, so repeated fits
      // (and container growth) never compound shrinkage.
      el.style.fontSize = '';
      const available = el.clientWidth;
      const needed = el.scrollWidth;
      if (available <= 0 || needed <= available) {
        return;
      }
      const base = Number.parseFloat(window.getComputedStyle(el).fontSize);
      if (!Number.isFinite(base) || base <= 0) {
        return;
      }
      const scale = Math.max(available / needed, MIN_FIT_SCALE);
      el.style.fontSize = `${base * scale}px`;
    };
    fit();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);

  return ref;
}
