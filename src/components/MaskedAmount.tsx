'use client';

/**
 * Masked financial amount — rendered wherever a module's `view_amounts`
 * permission is explicitly false (shared/permissions/permissions-schema.json).
 * Shows the symbol-only mask ₹••• with a screen-reader-only "Amount hidden"
 * label (`auth.permissions.amount_hidden_a11y`); no visible localized string
 * by contract. Use `maskAmount()` where amounts are interpolated into
 * translated strings (chips, snackbars, message templates).
 */
import Box from '@mui/material/Box';
import { useTranslations } from 'next-intl';

/** The symbol-only mask (₹ + 3 bullets) — identical across locales. */
export const AMOUNT_MASK = '\u20B9\u2022\u2022\u2022';

/**
 * String-level mask for interpolation contexts: returns the formatted amount
 * when `showAmounts`, the ₹••• mask otherwise.
 */
export function maskAmount(formatted: string, showAmounts: boolean): string {
  return showAmounts ? formatted : AMOUNT_MASK;
}

/** CSS-only visually hidden (screen readers still announce). */
const SR_ONLY = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

export default function MaskedAmount() {
  const t = useTranslations('auth.permissions');
  return (
    <Box component="span">
      <Box component="span" aria-hidden>
        {AMOUNT_MASK}
      </Box>
      <Box component="span" sx={SR_ONLY}>
        {t('amount_hidden_a11y')}
      </Box>
    </Box>
  );
}
