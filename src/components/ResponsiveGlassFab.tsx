'use client';

import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import type { ReactNode } from 'react';
import type { SxProps, Theme } from '@mui/material/styles';
import GlassFab from './GlassFab';

interface ResponsiveGlassFabProps {
  /** The FAB icon (always shown). */
  icon: ReactNode;
  /**
   * Accessible name AND the extended-variant text. Always applied as
   * `aria-label`, so the icon-only mobile FAB keeps its accessible name.
   */
  label: string;
  onClick: () => void;
  sx?: SxProps<Theme>;
}

/**
 * Section FAB, responsive to the shell's md boundary (same breakpoint that
 * flips the left rail / bottom nav): icon-only circular on mobile viewports,
 * extended (icon + text) on desktop. Keeps the GlassFab glass styling in both
 * modes and the aria-label in both modes.
 */
export default function ResponsiveGlassFab({ icon, label, onClick, sx }: ResponsiveGlassFabProps) {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));

  return (
    <GlassFab
      color="primary"
      variant={desktop ? 'extended' : 'circular'}
      aria-label={label}
      onClick={onClick}
      sx={sx}
    >
      <Box component="span" sx={{ display: 'inline-flex', mr: desktop ? 1 : 0 }}>
        {icon}
      </Box>
      {desktop ? label : null}
    </GlassFab>
  );
}
