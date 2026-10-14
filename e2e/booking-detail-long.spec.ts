/**
 * Booking card at a PHONE viewport with LONG content (many notes lines + several
 * payments), hermetic guest mode: the drawer body scrolls and the action row is a
 * sticky footer — Record payment is in the viewport BEFORE scrolling and still after
 * the body was scrolled to its end (Android ADR-107 parity).
 * Screenshots land in test-results/booking-detail-long/.
 */
import { expect, test } from '@playwright/test';
import { authConfigured, msg } from './helpers';

test.skip(authConfigured, 'hermetic-only: route protection is active in authenticated mode');

test.use({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true });

const SHOTS = 'test-results/booking-detail-long';
const NOTES = Array.from({ length: 18 }, (_, i) => `Line ${i + 1}: stage on the east lawn, caterer at 4 pm, 400 chairs, 2 generators.`).join('\n');

test('guest (phone): long card — actions pinned, histories reachable by scrolling the body', async ({ page }) => {
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
  await page.getByLabel(msg('en', 'booking.form.total_amount')).fill('500000');
  await page.getByLabel(msg('en', 'booking.form.advance')).fill('30000');
  await page.getByLabel(msg('en', 'booking.form.notes')).fill(NOTES);
  await page.getByRole('button', { name: msg('en', 'common.action.save') }).click();

  await page.getByText('Priya Sharma').first().click();
  const drawer = page.getByRole('presentation').filter({ hasText: msg('en', 'booking.card.payments_title') });
  const recordPayment = drawer.getByRole('button', { name: msg('en', 'booking.card.action_record_payment') });
  const audit = drawer.locator('[data-metadata]').filter({ hasText: /^Added by/ });

  // Pinned: in the viewport with NO scrolling; the audit line (end of the body) is not.
  await expect(recordPayment).toBeInViewport();
  await expect(audit).not.toBeInViewport();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/1-top-actions-pinned.png` });

  // Scroll the drawer body to the end: the audit line arrives, the actions stay.
  await audit.scrollIntoViewIfNeeded();
  await expect(audit).toBeInViewport();
  await expect(recordPayment).toBeInViewport();
  const footerBox = await recordPayment.boundingBox();
  const viewport = page.viewportSize();
  expect(footerBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(viewport!.height + 1);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/2-scrolled-actions-still-pinned.png` });

  // And the pinned button actually works: it opens the Record payment dialog.
  await recordPayment.click();
  await expect(page.getByLabel(msg('en', 'booking.payment.amount'))).toBeVisible();
});
