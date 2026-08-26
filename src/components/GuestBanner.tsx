'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { isGuestMode } from '@/lib/guest/guest';

/**
 * Thin persistent banner shown on every app screen while in guest mode:
 * explains that data lives only on this device and offers the sign-in CTA.
 * Cookie-driven, so it disappears the moment a real session takes over.
 */
export default function GuestBanner() {
  const t = useTranslations();
  // Read the cookie after mount to keep server/client renders identical.
  const [guest, setGuest] = useState(false);
  useEffect(() => {
    setGuest(isGuestMode());
  }, []);

  if (!guest) {
    return null;
  }

  return (
    <Box
      role="status"
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1.5,
        flexWrap: 'wrap',
        px: 2,
        py: 0.5,
        mb: 2,
        borderRadius: 2,
        bgcolor: 'warning.light',
        color: 'warning.contrastText',
      }}
    >
      <Typography variant="body2">{t('guest.banner.message')}</Typography>
      <Button component={Link} href="/sign-in" size="small" color="inherit" variant="outlined">
        {t('guest.banner.sign_in')}
      </Button>
    </Box>
  );
}
