import { expect, test } from '@playwright/test';
import { msg } from './helpers';

test('sign-in page renders the form', async ({ page }) => {
  await page.goto('/en/sign-in');
  await expect(page.getByRole('heading', { name: msg('en', 'auth.sign_in.title') })).toBeVisible();
  await expect(page.getByLabel(msg('en', 'auth.sign_in.email_label'))).toBeVisible();
  await expect(page.getByLabel(msg('en', 'auth.sign_in.password_label'))).toBeVisible();
  await expect(page.getByRole('button', { name: msg('en', 'auth.sign_in.submit') })).toBeVisible();
  // Hermetic mode runs without Supabase — the guard shows the warning.
  if (!process.env.E2E_SUPABASE_URL) {
    await expect(page.getByText(msg('en', 'auth.sign_in.not_configured'))).toBeVisible();
  }
});
