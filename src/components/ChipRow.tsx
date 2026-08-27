'use client';

import Stack, { type StackProps } from '@mui/material/Stack';

/**
 * Single-line, horizontally scrollable row for chip/pill quick filters
 * (report date presets, payment-method chips, booking-source chips, …).
 *
 * On narrow viewports the chips never wrap into a second line — the row
 * scrolls horizontally instead. The scrollbar is visually hidden but the
 * row stays scrollable by touch, trackpad and mouse wheel. Chips must not
 * shrink, otherwise their labels get clipped mid-scroll.
 */
export default function ChipRow({ sx, children, ...props }: StackProps) {
  return (
    <Stack
      direction="row"
      spacing={1}
      {...props}
      sx={[
        {
          flexWrap: 'nowrap',
          overflowX: 'auto',
          minWidth: 0,
          maxWidth: '100%',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none', // Firefox
          '&::-webkit-scrollbar': { display: 'none' }, // WebKit / Blink
          '& > *': { flexShrink: 0 },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Stack>
  );
}
