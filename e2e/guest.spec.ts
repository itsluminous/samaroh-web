/**
 * Guest mode ("try without an account") — hermetic: runs entirely on the
 * on-device Dexie store, no Supabase needed. Covers entry via the sign-in
 * page, the local business setup, the persistent banner and a local
 * expenses CRUD smoke (create + persistence across reload).
 */
import { expect, test } from '@playwright/test';
import { msg } from './helpers';

test('guest can set up locally, sees the banner, and local CRUD persists', async ({ page }) => {
  await page.goto('/en/sign-in');

  // Enter guest mode from the sign-in page.
  await page.getByRole('button', { name: msg('en', 'onboarding.sign_in.continue_offline') }).click();

  // Local business setup (same form as the signed-up flow).
  await expect(
    page.getByRole('heading', { name: msg('en', 'onboarding.create.title') }),
  ).toBeVisible();
  await page.getByLabel(msg('en', 'onboarding.create.name_label')).fill('E2E Guest Hall');
  await page.getByLabel(msg('en', 'onboarding.create.owner_label')).fill('E2E Owner');
  await page.getByRole('button', { name: msg('en', 'onboarding.create.submit') }).click();

  // Lands in the app with the persistent local-only banner.
  await page.waitForURL(/\/en\/booking/);
  await expect(page.getByText(msg('en', 'guest.banner.message'))).toBeVisible();

  // Local CRUD smoke: add a person in expenses.
  await page.goto('/en/expenses');
  await expect(page.getByText(msg('en', 'guest.banner.message'))).toBeVisible();
  await page.getByRole('button', { name: msg('en', 'expenses.home.add_person') }).click();
  await page.getByLabel(msg('en', 'expenses.person.name_label')).fill('Guest Party');
  await page.getByRole('button', { name: msg('en', 'common.action.save') }).click();
  await expect(page.getByText('Guest Party')).toBeVisible();

  // Data survives a reload — it lives in IndexedDB on this device.
  await page.reload();
  await expect(page.getByText('Guest Party')).toBeVisible();
  await expect(page.getByText(msg('en', 'guest.banner.message'))).toBeVisible();
});

test('banner sign-in CTA returns to the sign-in page', async ({ page }) => {
  await page.goto('/en/sign-in');
  await page.getByRole('button', { name: msg('en', 'onboarding.sign_in.continue_offline') }).click();
  await page.getByLabel(msg('en', 'onboarding.create.name_label')).fill('E2E Guest Hall');
  await page.getByLabel(msg('en', 'onboarding.create.owner_label')).fill('E2E Owner');
  await page.getByRole('button', { name: msg('en', 'onboarding.create.submit') }).click();
  await page.waitForURL(/\/en\/booking/);

  await page.getByRole('link', { name: msg('en', 'guest.banner.sign_in') }).click();
  await page.waitForURL(/\/en\/sign-in/);
  await expect(
    page.getByRole('heading', { name: msg('en', 'auth.sign_in.title') }),
  ).toBeVisible();
});
