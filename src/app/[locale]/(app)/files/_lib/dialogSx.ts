/**
 * Shared sizing for the Files module's small dialogs (owner feedback
 * 2026-09-30, picker items 3/4): on a phone viewport the paper spans nearly
 * the full width (8 px gutters instead of MUI's 32 px default margin), rows
 * stay compact and the text is body-sized; from `sm` up the usual `xs`
 * max-width dialog applies. Used by the folder picker, the name dialogs and
 * the access editor so every chooser looks the same.
 */
import type { DialogProps } from '@mui/material/Dialog';

export const compactDialogProps: Pick<DialogProps, 'fullWidth' | 'maxWidth' | 'slotProps'> = {
  fullWidth: true,
  maxWidth: 'xs',
  slotProps: {
    paper: {
      sx: {
        m: { xs: 1, sm: 4 },
        width: { xs: 'calc(100% - 16px)', sm: undefined },
        maxWidth: { xs: 'calc(100% - 16px)', sm: 444 },
        maxHeight: { xs: 'calc(100% - 16px)', sm: 'calc(100% - 64px)' },
      },
    },
  },
};
