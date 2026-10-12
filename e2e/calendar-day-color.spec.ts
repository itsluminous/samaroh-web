/**
 * Calendar day colour at a PHONE viewport, hermetic guest mode
 * (shared/docs/calendar-day-color.md): two RED (tomato) bookings on the same
 * day render two tomato pills — nothing blends, nothing falls back to the
 * themed purple. Screenshot in test-results/calendar-day-color/.
 */
import { expect, test } from '@playwright/test';
import { authConfigured, msg } from './helpers';

test.skip(authConfigured, 'hermetic-only: route protection is active in authenticated mode');

test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

const SHOTS = 'test-results/calendar-day-color';
const TOMATO = 'rgb(198, 40, 40)'; // #C62828 — booking-colors.json `tomato`

test('guest (phone): two red bookings on one day stay red', async ({ page }) => {
  await page.goto('/en/sign-in');
  await page.getByRole('button', { name: msg('en', 'onboarding.sign_in.continue_offline') }).click();
  await page.getByLabel(msg('en', 'onboarding.create.name_label')).fill('E2E Guest Hall');
  await page.getByLabel(msg('en', 'onboarding.create.owner_label')).fill('E2E Owner');
  await page.getByRole('button', { name: msg('en', 'onboarding.create.submit') }).click();
  await page.waitForURL(/\/en\/booking/);

  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  for (const name of ['Priya Sharma', 'Ramesh Kumar']) {
    await page.getByRole('button', { name: msg('en', 'booking.calendar.add') }).click();
    await page.getByLabel(msg('en', 'booking.form.customer_name')).fill(name);
    await page.getByLabel(msg('en', 'booking.form.start_date')).fill(iso);
    await page.getByLabel(msg('en', 'booking.form.end_date')).fill(iso);
    await page.getByRole('button', { name: msg('en', 'booking.color.tomato') }).click();
    await page.getByRole('button', { name: msg('en', 'common.action.save') }).click();
    // The hall may host two events on one day: a conflict dialog is advisory.
    // `isVisible()` does not wait (its timeout is ignored), so WAIT for the
    // dialog briefly — the overlap check is async and the second booking's
    // dialog may not have mounted yet when the save button releases.
    const proceed = page.getByRole('button', { name: msg('en', 'booking.form.conflict_save_anyway') });
    const conflictShown = await proceed
      .waitFor({ state: 'visible', timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (conflictShown) {
      await proceed.click();
    }
    await expect(page.getByText(name).first()).toBeVisible();
  }

  const pills = page.locator('[data-booking-pill]');
  await expect(pills).toHaveCount(2);
  const colours = await pills.evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
  expect(colours).toEqual([TOMATO, TOMATO]);
  await page.screenshot({ path: `${SHOTS}/two-red-bookings-phone.png` });
});
