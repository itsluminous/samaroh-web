'use client';

// Reusable 16-swatch booking-color picker (shared/booking-colors.json) with a
// leading "default" swatch (value = null). Used by the booking form and note
// editor (compact single-row dots) and the event-type preset dialog
// (standard wrapping grid). Native buttons: Tab moves between swatches,
// Enter/Space selects.

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import type { Theme } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import { BOOKING_COLORS } from '@/lib/booking/bookingColors';

/** Compact-dot diameter — small enough for one scrollable row on phones. */
export const COMPACT_SWATCH_SIZE = 22;
/** Standard swatch diameter (wrapping grid). */
export const STANDARD_SWATCH_SIZE = 32;

export default function ColorSwatchPicker({
  label,
  value,
  onChange,
  defaultHex,
  compact = false,
}: {
  /** Accessible name of the swatch group (a translated string). */
  label: string;
  /** Selected booking-colors.json key; null = the default swatch. */
  value: string | null;
  onChange: (key: string | null) => void;
  /** Preview color of the default swatch; falls back to the themed purple. */
  defaultHex?: string;
  /**
   * Compact variant: small dots in ONE horizontally scrollable row instead
   * of the wrapping grid — frees vertical space for the surrounding form.
   */
  compact?: boolean;
}) {
  const t = useTranslations();
  const size = compact ? COMPACT_SWATCH_SIZE : STANDARD_SWATCH_SIZE;
  const swatchSx = (selected: boolean, bg: string | undefined) => (theme: Theme) => ({
    width: size,
    height: size,
    flexShrink: 0,
    borderRadius: '50%',
    bgcolor: bg ?? 'primary.main',
    border: 1,
    borderColor: 'divider',
    boxShadow: selected
      ? `0 0 0 2px ${theme.palette.background.paper}, 0 0 0 4px ${theme.palette.primary.main}`
      : 'none',
  });

  return (
    <Box
      role="group"
      aria-label={label}
      sx={
        compact
          ? // Single row; the padding keeps the selection ring (4px halo)
            // from being clipped by the scroll container.
            { display: 'flex', flexWrap: 'nowrap', overflowX: 'auto', gap: 1, p: 0.5 }
          : { display: 'flex', flexWrap: 'wrap', gap: 1 }
      }
    >
      <ButtonBase
        aria-label={t('booking.color.default')}
        aria-pressed={value === null}
        onClick={() => onChange(null)}
        sx={swatchSx(value === null, defaultHex)}
      />
      {BOOKING_COLORS.map((c) => (
        <ButtonBase
          key={c.key}
          aria-label={t(c.label_key)}
          aria-pressed={value === c.key}
          onClick={() => onChange(c.key)}
          sx={swatchSx(value === c.key, c.hex)}
        />
      ))}
    </Box>
  );
}
