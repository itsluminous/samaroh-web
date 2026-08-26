import { expect, test } from '@playwright/test';
import { authConfigured, msg } from './helpers';

test('booking page renders (hermetic: graceful empty state)', async ({ page }) => {
  test.skip(authConfigured, 'covered by the authenticated calendar test');
  await page.goto('/en/booking');
  // Without Supabase the booking screen degrades to the no-business empty
  // state by contract (AGENTS.md); the shell around it must still render.
  await expect(page.getByText(msg('en', 'booking.empty.no_business_title'))).toBeVisible();
  await expect(
    page.getByRole('navigation').getByText(msg('en', 'common.nav.booking')).first(),
  ).toBeVisible();
});

test('booking calendar renders after sign-in (authenticated mode)', async ({ page }) => {
  test.skip(!authConfigured, 'set E2E_SUPABASE_URL/ANON_KEY/EMAIL/PASSWORD to enable');
  await page.goto('/en/sign-in');
  await page.getByLabel(msg('en', 'auth.sign_in.email_label')).fill(process.env.E2E_EMAIL!);
  await page.getByLabel(msg('en', 'auth.sign_in.password_label')).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: msg('en', 'auth.sign_in.submit') }).click();
  await page.waitForURL(/\/en(\/booking)?$/);
  await page.goto('/en/booking');
  // Month navigation controls prove the calendar grid mounted.
  await expect(page.getByLabel(msg('en', 'booking.calendar.prev_month'))).toBeVisible();
  await expect(page.getByLabel(msg('en', 'booking.calendar.next_month'))).toBeVisible();
});
