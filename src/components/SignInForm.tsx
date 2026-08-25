'use client';

import GoogleIcon from '@mui/icons-material/Google';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';

export default function SignInForm() {
  const t = useTranslations();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const configured = supabase !== null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      return;
    }
    setSubmitting(true);
    setError(false);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (signInError) {
      setError(true);
      return;
    }
    router.push('/booking');
    router.refresh();
  }

  async function handleGoogle() {
    // Stub: OAuth redirect URL wiring (Supabase dashboard + Google Cloud
    // console) is completed in a later track; the button is functional once
    // the provider is configured server-side.
    if (!supabase) {
      return;
    }
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2,
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 400 }}>
        <CardContent>
          <Stack spacing={2} component="form" onSubmit={handleSubmit}>
            <Typography variant="h5" component="h1" color="primary" textAlign="center">
              {t('common.app_name')}
            </Typography>
            <Typography variant="h6" component="h2" textAlign="center">
              {t('auth.sign_in.title')}
            </Typography>

            {!configured && <Alert severity="warning">{t('auth.sign_in.not_configured')}</Alert>}
            {error && <Alert severity="error">{t('auth.sign_in.error')}</Alert>}

            <TextField
              type="email"
              label={t('auth.sign_in.email_label')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={!configured || submitting}
              autoComplete="email"
            />
            <TextField
              type="password"
              label={t('auth.sign_in.password_label')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={!configured || submitting}
              autoComplete="current-password"
            />
            <Button type="submit" variant="contained" disabled={!configured || submitting}>
              {submitting ? t('common.state.loading') : t('auth.sign_in.submit')}
            </Button>

            <Divider />

            <Button
              variant="outlined"
              startIcon={<GoogleIcon />}
              onClick={handleGoogle}
              disabled={!configured || submitting}
            >
              {t('auth.sign_in.google')}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
