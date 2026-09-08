'use client';

import Box from '@mui/material/Box';
import { useLayoutEffect, useRef } from 'react';

/** Never shrink below this — an unreadable number is worse than a clipped one. */
export const MIN_SHRINK_FONT_PX = 9;

/**
 * True for report table cells that hold pure numeric/amount content
 * (₹ amounts, counts, percentages, masked ₹••• values, ISO dates) — the
 * cells the autoshrink applies to. Any cell containing letters (month
 * names, customer/party names, the TOTAL label, quantities with units)
 * is a label-ish cell and stays untouched.
 */
export function isNumericCellText(text: string): boolean {
  return /[\d₹•]/.test(text) && !/\p{L}/u.test(text);
}

/**
 * Single-line number cell that shrinks its font-size (per cell) instead of
 * wrapping: after layout it measures `scrollWidth` vs the available width
 * and, when the text would overflow, scales the font down proportionally
 * (floored at {@link MIN_SHRINK_FONT_PX}). Re-measures on container resizes
 * via ResizeObserver, starting from the inherited font-size each time — so
 * growing the viewport restores the full size, and large accessibility
 * fonts shrink relative to their own base. Labels never pass
 * {@link isNumericCellText}, so they keep wrapping normally.
 */
export default function AutoShrinkText({ children }: { children: string }) {
  const ref = useRef<HTMLElement>(null);

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
      const fitted = Math.max((base * available) / needed, MIN_SHRINK_FONT_PX);
      el.style.fontSize = `${fitted}px`;
    };
    fit();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [children]);

  return (
    <Box
      component="span"
      ref={ref}
      sx={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', minWidth: 0 }}
    >
      {children}
    </Box>
  );
}
