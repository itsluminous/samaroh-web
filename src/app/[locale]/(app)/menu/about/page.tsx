import GitHubIcon from '@mui/icons-material/GitHub';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';

// About (§4.4): GitHub link, licenses note, made with ❤️.
// No version line on web — the app deploys continuously, so there is no
// meaningful user-facing version number (unlike the Android build).
// The source URL is DATA from the shared catalog (ADR-034 pattern —
// menu.about.source_code_url_web; Android's row uses source_code_url).

export default function AboutPage() {
  const t = useTranslations('menu.about');
  return (
    <Stack spacing={3} sx={{ maxWidth: 640 }}>
      <Typography variant="h5" component="h1">
        {t('title')}
      </Typography>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Link
            href={t('source_code_url_web')}
            target="_blank"
            rel="noopener noreferrer"
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}
          >
            <GitHubIcon fontSize="small" />
            {t('source_code')}
          </Link>
          <Typography variant="subtitle2">{t('licenses')}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t('licenses_body_web')}
          </Typography>
          <Typography variant="body2">{t('made_with_love')}</Typography>
        </Stack>
      </Paper>
    </Stack>
  );
}
