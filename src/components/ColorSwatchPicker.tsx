'use client';

// Reusable 16-swatch booking-color picker (shared/booking-colors.json) with a
// leading "default" swatch (value = null). Used by the booking form (where
// the default previews the event type's color) and the event-type preset
// dialog (where the default is the themed purple). Native buttons: Tab moves
// between swatches, Enter/Space selects.

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import type { Theme } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import { BOOKING_COLORS } from '@/lib/booking/bookingColors';

export default function ColorSwatchPicker({
  label,
  value,
  onChange,
  defaultHex,
}: {
  /** Accessible name of the swatch group (a translated string). */
  label: string;
  /** Selected booking-colors.json key; null = the default swatch. */
  value: string | null;
  onChange: (key: string | null) => void;
  /** Preview color of the default swatch; falls back to the themed purple. */
  defaultHex?: string;
}) {
  const t = useTranslations();
  const swatchSx = (selected: boolean, bg: string | undefined) => (theme: Theme) => ({
    width: 32,
    height: 32,
    borderRadius: '50%',
    bgcolor: bg ?? 'primary.main',
    border: 1,
    borderColor: 'divider',
    boxShadow: selected
      ? `0 0 0 2px ${theme.palette.background.paper}, 0 0 0 4px ${theme.palette.primary.main}`
      : 'none',
  });

  return (
    <Box role="group" aria-label={label} sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
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
