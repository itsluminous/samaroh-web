'use client';

import { createTheme } from '@mui/material/styles';

/** Font stack of the `metadata` typography variant (monospace; used by MetadataText + tests). */
export const METADATA_FONT_FAMILY =
  '"Roboto Mono", "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace';

declare module '@mui/material/styles' {
  interface TypographyVariants {
    metadata: React.CSSProperties;
  }
  interface TypographyVariantsOptions {
    metadata?: React.CSSProperties;
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    metadata: true;
  }
}

/**
 * Material-You-like theme built from the shared brand palette
 * (shared/brand/palette.md — seed #6750A4). Light + dark schemes; the
 * effective mode follows the user/system preference via CSS variables.
 */
const theme = createTheme({
  cssVariables: {
    colorSchemeSelector: 'class',
  },
  colorSchemes: {
    light: {
      palette: {
        primary: {
          main: '#6750A4',
          contrastText: '#FFFFFF',
        },
        secondary: {
          main: '#625B71',
          contrastText: '#FFFFFF',
        },
        error: {
          main: '#B3261E',
          contrastText: '#FFFFFF',
        },
        success: {
          // moneyIn semantic token
          main: '#146C2E',
        },
        warning: {
          // tentative semantic token
          main: '#7A5900',
        },
        background: {
          default: '#FFFBFE',
          paper: '#FFFBFE',
        },
        text: {
          primary: '#1C1B1F',
          secondary: '#49454F',
        },
        divider: '#79747E',
      },
    },
    dark: {
      palette: {
        primary: {
          main: '#D0BCFF',
          contrastText: '#381E72',
        },
        secondary: {
          main: '#CCC2DC',
          contrastText: '#332D41',
        },
        error: {
          main: '#F2B8B5',
          contrastText: '#601410',
        },
        success: {
          main: '#6DD58C',
        },
        warning: {
          main: '#F7BD48',
        },
        background: {
          default: '#1C1B1F',
          paper: '#1C1B1F',
        },
        text: {
          primary: '#E6E1E5',
          secondary: '#CAC4D0',
        },
        divider: '#938F99',
      },
    },
  },
  shape: {
    // Expressive rounded corners, in the spirit of Material 3.
    borderRadius: 16,
  },
  typography: {
    button: {
      textTransform: 'none',
      fontWeight: 600,
    },
    // Metadata lines (attribution / timestamps / audit): caption size in a
    // monospace family so they read as metadata, not content. Rendered via
    // `src/components/MetadataText.tsx`; Android uses labelSmall + monospace.
    metadata: {
      fontFamily: METADATA_FONT_FAMILY,
      fontSize: '0.75rem',
      lineHeight: 1.66,
      fontWeight: 400,
      letterSpacing: '0.02em',
    },
  },
  components: {
    MuiTypography: {
      defaultProps: {
        variantMapping: {
          metadata: 'span',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 100,
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
      },
    },
  },
});

export default theme;
