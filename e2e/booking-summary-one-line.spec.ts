/**
 * Booking tab summary at a PHONE viewport, hermetic guest mode: with a
 * crore-scale total the "Received … / Pending …" figures stay on ONE line
 * (autoshrink, no wrap, no clipping). Screenshot in
 * test-results/booking-summary-one-line/.
 */
import { expect, test } from '@playwright/test';
import { authConfigured, msg } from './helpers';

test.skip(authConfigured, 'hermetic-only: route protection is active in authenticated mode');

test.use({ viewport: { width: 320, height: 720 }, isMobile: true, hasTouch: true });

const SHOTS = 'test-results/booking-summary-one-line';

test('guest (phone 320px): summary amounts never wrap', async ({ page }) => {
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
  await page.getByLabel(msg('en', 'booking.form.total_amount')).fill('99999999');
  await page.getByRole('button', { name: msg('en', 'common.action.save') }).click();

  const received = page.getByTestId('summary-received');
  const pending = page.getByTestId('summary-pending');
  await expect(pending).toContainText('9,99,99,999');
  for (const half of [received, pending]) {
    const m = await half.locator('span').first().evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        lines: Math.round(el.getBoundingClientRect().height / parseFloat(s.lineHeight)),
        overflow: el.scrollWidth - el.clientWidth,
        fontPx: parseFloat(s.fontSize),
      };
    });
    expect(m.lines).toBe(1);
    expect(m.overflow).toBeLessThanOrEqual(1);
    expect(m.fontPx).toBeGreaterThanOrEqual(9);
  }
  await page.screenshot({ path: `${SHOTS}/summary-320-phone.png` });
});
