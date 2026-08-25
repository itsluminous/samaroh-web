'use client';

import Fab from '@mui/material/Fab';
import { styled } from '@mui/material/styles';
// Enables `theme.vars` typing (the app theme runs in CSS-variables mode).
import type {} from '@mui/material/themeCssVarsAugmentation';

/**
 * Floating action button with a "glass" container, per the cross-platform FAB
 * convention (matches Android): a ~75%-opacity primary background with backdrop
 * blur so content behind stays visible, a fully opaque border in the primary
 * color, and a fully opaque background on hover/focus for usability.
 *
 * Drop-in replacement for MUI's `Fab` — accepts all the same props.
 */
const GlassFab = styled(Fab)(({ theme }) => ({
  backgroundColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.75)`,
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  border: `2px solid ${theme.vars.palette.primary.main}`,
  color: theme.vars.palette.primary.contrastText,
  '&:hover, &:focus-visible': {
    backgroundColor: theme.vars.palette.primary.main,
  },
}));

export default GlassFab;
