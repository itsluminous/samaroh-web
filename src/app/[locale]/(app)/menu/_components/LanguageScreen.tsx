'use client';

/**
 * Full-screen language picker (§4.4). Each language is shown in its own
 * script — the catalog keeps `settings.language.name_en` = "English",
 * `settings.language.name_hi` = "हिन्दी" and `settings.language.name_hi_latn` =
 * "Hinglish" untranslated in ALL locales, so the labels stay in their native
 * script whatever the current UI language is (key suffix via `localeKeySuffix`).
 * Switching navigates to the same path under the other locale; the i18n
 * middleware persists the choice in the NEXT_LOCALE cookie. Selection is an
 * exact tag match — `hi-Latn` must never tick the `hi` row.
 */
import CheckIcon from '@mui/icons-material/Check';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { localeKeySuffix, routing } from '@/i18n/routing';

export default function LanguageScreen() {
  const t = useTranslations('settings.language');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const pick = (nextLocale: AppLocale) => {
    startTransition(() => {
      router.replace(pathname, { locale: nextLocale });
    });
  };

  return (
    <>
      <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
        {t('picker_title')}
      </Typography>
      <Paper variant="outlined" sx={{ maxWidth: 480 }}>
        <List disablePadding>
          {routing.locales.map((l) => (
            <ListItem key={l} disablePadding divider>
              <ListItemButton selected={l === locale} disabled={isPending} onClick={() => pick(l)}>
                <ListItemText primary={t(`name_${localeKeySuffix(l)}`)} />
                {l === locale ? (
                  <ListItemIcon sx={{ minWidth: 0 }}>
                    <CheckIcon color="primary" />
                  </ListItemIcon>
                ) : null}
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Paper>
    </>
  );
}
