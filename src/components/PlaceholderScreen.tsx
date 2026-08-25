import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';

/**
 * Localized placeholder rendered by the four section pages until the real
 * features land (WW-1a/WW-1b/WW-2 — see AGENTS.md ownership map).
 */
export default function PlaceholderScreen({ feature }: { feature: string }) {
  const t = useTranslations('app.placeholder');

  return (
    <Box sx={{ textAlign: 'center', mt: 8 }}>
      <Typography variant="h4" component="h2" gutterBottom>
        {t('title')}
      </Typography>
      <Typography variant="body1" color="text.secondary">
        {t('message', { feature })}
      </Typography>
    </Box>
  );
}
