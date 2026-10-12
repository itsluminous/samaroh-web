/**
 * Invoice PDF at a PHONE viewport, hermetic guest mode (layout-spec
 * 2026-10-12): a booking whose manual invoice number is the bare register
 * number `88` downloads as `INV-0088.pdf` (display form, never `88.pdf`) and
 * the detail drawer's "Invoice no." line shows the same display form.
 * Screenshots land in test-results/invoice-download/.
 */
import { expect, test } from '@playwright/test';
import { authConfigured, msg } from './helpers';

test.skip(authConfigured, 'hermetic-only: route protection is active in authenticated mode');

test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

const SHOTS = 'test-results/invoice-download';

test('guest (phone): PDF is named after the display invoice number', async ({ page }) => {
  await page.goto('/en/sign-in');
  await page.getByRole('button', { name: msg('en', 'onboarding.sign_in.continue_offline') }).click();
  await page.getByLabel(msg('en', 'onboarding.create.name_label')).fill('E2E Guest Hall');
  await page.getByLabel(msg('en', 'onboarding.create.owner_label')).fill('E2E Owner');
  await page.getByRole('button', { name: msg('en', 'onboarding.create.submit') }).click();
  await page.waitForURL(/\/en\/booking/);

  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  await page.getByRole('button', { name: msg('en', 'booking.calendar.add') }).click();
  await page.getByLabel(msg('en', 'booking.form.customer_name')).fill('Priya Sharma');
  await page.getByLabel(msg('en', 'booking.form.start_date')).fill(iso);
  await page.getByLabel(msg('en', 'booking.form.end_date')).fill(iso);
  await page.getByLabel(msg('en', 'booking.form.notes')).fill('Stage on the north side');
  await page.getByLabel(msg('en', 'booking.form.invoice_number')).fill('88');
  await page.getByRole('button', { name: msg('en', 'common.action.save') }).click();

  await page.getByText('Priya Sharma').first().click();
  // Display form on the detail line (guest business prefix is INV).
  await expect(page.getByText(`${msg('en', 'invoice.number_label')} INV-0088`)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/detail-phone.png` });

  await page.getByRole('button', { name: msg('en', 'booking.card.action_invoice') }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: msg('en', 'booking.card.invoice_pdf') }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('INV-0088.pdf');
});
