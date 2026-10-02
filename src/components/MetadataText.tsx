'use client';

/**
 * Metadata line — attribution / timestamp / audit text such as
 * "Added by Priya on 12 Sep 2026", "Updated 2 days ago" or a ledger entry
 * date. Renders the shared `metadata` typography variant (caption size,
 * monospace family — see `src/theme/theme.ts`) in a muted colour so metadata
 * is visually distinct from the content it annotates (notes/body text stay
 * body size in `text.primary`). Cross-platform convention with Android
 * (`labelSmall` + monospace + `onSurfaceVariant`).
 *
 * Pass `component="div"` for a block line, or leave the default `span` when
 * composing inside a `ListItemText` secondary / inline string.
 */
import Typography, { type TypographyProps } from '@mui/material/Typography';
import type { ElementType } from 'react';

export { METADATA_FONT_FAMILY } from '@/theme/theme';

export type MetadataTextProps = Omit<TypographyProps, 'variant'> & {
  /** Root element (default `span`, so it can live inside a `<p>` secondary). */
  component?: ElementType;
};

export default function MetadataText({ color = 'text.secondary', component = 'span', ...rest }: MetadataTextProps) {
  return <Typography variant="metadata" color={color} component={component} data-metadata {...rest} />;
}
