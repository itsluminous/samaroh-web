'use client';

import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import type { SelectChangeEvent } from '@mui/material/Select';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';

/**
 * Locale switcher stub for the app shell. Navigating to the other locale also
 * persists the choice in the NEXT_LOCALE cookie (set by the i18n middleware).
 */
export default function LocaleSwitcher() {
  const t = useTranslations('common.language');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function handleChange(event: SelectChangeEvent) {
    const nextLocale = event.target.value as AppLocale;
    startTransition(() => {
      router.replace(pathname, { locale: nextLocale });
    });
  }

  return (
    <Select
      value={locale}
      onChange={handleChange}
      size="small"
      disabled={isPending}
      inputProps={{ 'aria-label': t('switcher_label') }}
      sx={{ minWidth: 120 }}
    >
      {routing.locales.map((l) => (
        <MenuItem key={l} value={l}>
          {t(l)}
        </MenuItem>
      ))}
    </Select>
  );
}
