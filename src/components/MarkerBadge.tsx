'use client';

/**
 * Marker-kind badge — a small outlined chip with a flag icon and the short
 * `booking.event_type.marker_badge` label ("Marker" / "सूचक"). Rendered next
 * to every event type whose `kind === 'marker'` (Lagan/Tilak-style date
 * indicators) wherever event types are listed for CHOICE: the booking form's
 * event-type picker options and the event-types manage list. Makes marker
 * types distinguishable from bookable types at a glance (cross-platform
 * convention with Android; see docs/decisions.md).
 *
 * The chip is part of the option's accessible name on purpose — a screen
 * reader user hears "⭐ Lagan Marker" — so never mark it aria-hidden.
 */
import OutlinedFlagIcon from '@mui/icons-material/OutlinedFlag';
import Chip, { type ChipProps } from '@mui/material/Chip';
import { useTranslations } from 'next-intl';

export type MarkerBadgeProps = Omit<ChipProps, 'label' | 'icon' | 'size' | 'variant'>;

export default function MarkerBadge(props: MarkerBadgeProps) {
  const t = useTranslations();
  return (
    <Chip
      size="small"
      variant="outlined"
      icon={<OutlinedFlagIcon />}
      label={t('booking.event_type.marker_badge')}
      data-marker-badge
      {...props}
    />
  );
}
