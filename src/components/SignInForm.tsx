'use client';

import GoogleIcon from '@mui/icons-material/Google';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useTranslations } from 'next-intl';
import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { seedEventTypes } from '@/lib/booking/eventTypePresets';
import { enterGuestMode, leaveGuestMode } from '@/lib/guest/guest';
import { hasGuestBusiness, seedGuestBusiness } from '@/lib/guest/seed';
import { createRemoteClient } from '@/lib/supabase/client';

type Mode = 'sign_in' | 'sign_up';
type Step = 'auth' | 'setup';

interface Notice {
  severity: 'error' | 'info';
  text: string;
}

/** Suggested business types (shared onboarding contract, free text column). */
const BUSINESS_TYPE_KEYS = [
  'marriage_hall',
  'banquet_hall',
  'community_hall',
  'guest_house',
  'other',
] as const;

const MIN_PASSWORD_LENGTH = 6;

export default function SignInForm() {
  const t = useTranslations();
  const router = useRouter();
  // Always the real Supabase client here: auth must reach the server even
  // while a guest cookie is set (guest.ts). Null when unconfigured.
  const supabase = useMemo(() => createRemoteClient(), []);

  const [mode, setMode] = useState<Mode>('sign_in');
  const [step, setStep] = useState<Step>('auth');
  const [setupForGuest, setSetupForGuest] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Create-business step fields (§ onboarding contract: name*, type, address, owner*).
  const [bizName, setBizName] = useState('');
  const [bizTypeKey, setBizTypeKey] = useState<(typeof BUSINESS_TYPE_KEYS)[number]>('marriage_hall');
  const [bizAddress, setBizAddress] = useState('');
  const [ownerName, setOwnerName] = useState('');

  const configured = supabase !== null;

  function goToApp() {
    router.push('/booking');
    router.refresh();
  }

  /** After a live session exists: route to the app, or to business setup. */
  async function continueAfterAuth(client: SupabaseClient, uid: string) {
    leaveGuestMode();
    setUserId(uid);
    const { data } = await client
      .from('businesses')
      .select('id')
      .is('deleted_at', null)
      .limit(1);
    if (data && data.length > 0) {
      goToApp();
      return;
    }
    setSetupForGuest(false);
    setStep('setup');
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      return;
    }
    setNotice(null);

    if (mode === 'sign_up' && password.length < MIN_PASSWORD_LENGTH) {
      setNotice({ severity: 'error', text: t('auth.sign_up.password_min') });
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'sign_in') {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error || !data.user) {
          setNotice({ severity: 'error', text: t('auth.sign_in.error') });
          return;
        }
        await continueAfterAuth(supabase, data.user.id);
        return;
      }

      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setNotice({ severity: 'error', text: t('auth.sign_up.error') });
        return;
      }
      // Supabase obfuscates existing emails: user comes back with no identities.
      if (data.user && (data.user.identities?.length ?? 0) === 0) {
        setNotice({ severity: 'error', text: t('auth.sign_up.exists') });
        return;
      }
      if (!data.session) {
        // Email confirmation required before the first sign-in.
        setNotice({ severity: 'info', text: t('auth.sign_up.confirm_email') });
        setMode('sign_in');
        return;
      }
      await continueAfterAuth(supabase, data.session.user.id);
    } finally {
      setSubmitting(false);
    }
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

  /** "Try without an account": local-only guest mode (see lib/guest). */
  async function handleGuest() {
    setNotice(null);
    enterGuestMode();
    if (await hasGuestBusiness()) {
      goToApp(); // returning guest — local data is still there
      return;
    }
    setSetupForGuest(true);
    setStep('setup');
  }

  async function handleSetupSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setSubmitting(true);
    try {
      const businessType = t(`onboarding.business_type.${bizTypeKey}`);
      if (setupForGuest) {
        await seedGuestBusiness(
          {
            name: bizName.trim(),
            businessType,
            address: bizAddress.trim() || null,
            ownerName: ownerName.trim(),
          },
          (key) => t(key),
        );
        goToApp();
        return;
      }
      if (!supabase || !userId) {
        return;
      }
      const businessId = crypto.randomUUID();
      const { error: bizError } = await supabase.from('businesses').insert({
        id: businessId,
        name: bizName.trim(),
        business_type: businessType,
        address: bizAddress.trim() || null,
        owner_name: ownerName.trim(),
        owner_user_id: userId,
      });
      if (bizError) {
        setNotice({ severity: 'error', text: t('onboarding.create.error') });
        return;
      }
      const { error: memberError } = await supabase.from('business_members').insert({
        id: crypto.randomUUID(),
        business_id: businessId,
        invited_email: email,
        user_id: userId,
        display_name: ownerName.trim(),
        is_owner: true,
        status: 'active',
        permissions: {},
      });
      if (memberError) {
        setNotice({ severity: 'error', text: t('onboarding.create.error') });
        return;
      }
      // Built-in event-type presets (best effort — never blocks sign-up;
      // reads fall back to the static template while migration 006 lags).
      await seedEventTypes(supabase, businessId, (key) => t(key));
      goToApp();
    } finally {
      setSubmitting(false);
    }
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
          {step === 'auth' ? (
            <Stack spacing={2} component="form" onSubmit={handleAuthSubmit}>
              <Typography variant="h5" component="h1" color="primary" textAlign="center">
                {t('common.app_name')}
              </Typography>
              <Typography variant="h6" component="h2" textAlign="center">
                {mode === 'sign_in' ? t('auth.sign_in.title') : t('auth.sign_up.title')}
              </Typography>

              {!configured && <Alert severity="warning">{t('auth.sign_in.not_configured')}</Alert>}
              {notice && <Alert severity={notice.severity}>{notice.text}</Alert>}

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
                autoComplete={mode === 'sign_in' ? 'current-password' : 'new-password'}
              />
              <Button type="submit" variant="contained" disabled={!configured || submitting}>
                {submitting
                  ? t('common.state.loading')
                  : mode === 'sign_in'
                    ? t('auth.sign_in.submit')
                    : t('auth.sign_up.submit')}
              </Button>
              <Button
                variant="text"
                size="small"
                // Pure view switch — usable even when Supabase is unconfigured
                // (the sign-up view shows the same warning + disabled inputs).
                disabled={submitting}
                onClick={() => {
                  setNotice(null);
                  setMode(mode === 'sign_in' ? 'sign_up' : 'sign_in');
                }}
              >
                {mode === 'sign_in' ? t('auth.mode.to_sign_up') : t('auth.mode.to_sign_in')}
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
              {/* Guest mode is fully local — available even without Supabase. */}
              <Button variant="text" onClick={handleGuest} disabled={submitting}>
                {t('onboarding.sign_in.continue_offline')}
              </Button>
            </Stack>
          ) : (
            <Stack spacing={2} component="form" onSubmit={handleSetupSubmit}>
              <Typography variant="h5" component="h1" color="primary" textAlign="center">
                {t('common.app_name')}
              </Typography>
              <Typography variant="h6" component="h2" textAlign="center">
                {t('onboarding.create.title')}
              </Typography>

              {setupForGuest && <Alert severity="info">{t('guest.banner.message')}</Alert>}
              {notice && <Alert severity={notice.severity}>{notice.text}</Alert>}

              <TextField
                label={t('onboarding.create.name_label')}
                value={bizName}
                onChange={(e) => setBizName(e.target.value)}
                required
                disabled={submitting}
              />
              <TextField
                select
                label={t('onboarding.create.type_label')}
                value={bizTypeKey}
                onChange={(e) => setBizTypeKey(e.target.value as (typeof BUSINESS_TYPE_KEYS)[number])}
                disabled={submitting}
              >
                {BUSINESS_TYPE_KEYS.map((key) => (
                  <MenuItem key={key} value={key}>
                    {t(`onboarding.business_type.${key}`)}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label={t('onboarding.create.address_label')}
                value={bizAddress}
                onChange={(e) => setBizAddress(e.target.value)}
                disabled={submitting}
              />
              <TextField
                label={t('onboarding.create.owner_label')}
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                required
                disabled={submitting}
              />
              <Button type="submit" variant="contained" disabled={submitting}>
                {submitting ? t('common.state.loading') : t('onboarding.create.submit')}
              </Button>
            </Stack>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
