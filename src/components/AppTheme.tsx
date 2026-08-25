'use client';

import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import type { ReactNode } from 'react';
import theme from '@/theme/theme';

/**
 * Client boundary that applies the MUI theme. `defaultMode="system"` follows
 * the OS light/dark preference; users can override it later via useColorScheme.
 */
export default function AppTheme({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={theme} defaultMode="system">
      <CssBaseline enableColorScheme />
      {children}
    </ThemeProvider>
  );
}
