/**
 * Booking form event-type picker at a PHONE viewport, hermetic guest mode:
 * marker-kind presets (the seeded Lagan + Tilak) carry the flag "Marker"
 * badge in the dropdown, bookable presets do not, and selecting a marker
 * shows the marker hint under the field (and hides the amount fields).
 * Screenshots land in test-results/booking-form-marker-badge/.
 */
import { expect, test } from '@playwright/test';
import { authConfigured, msg } from './helpers';

test.skip(authConfigured, 'hermetic-only: route protection is active in authenticated mode');

test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

const SHOTS = 'test-results/booking-form-marker-badge';

test('guest (phone): marker options are badged, hint shows on selection', async ({ page }) => {
  await page.goto('/en/sign-in');
  await page.getByRole('button', { name: msg('en', 'onboarding.sign_in.continue_offline') }).click();
  await page.getByLabel(msg('en', 'onboarding.create.name_label')).fill('E2E Guest Hall');
  await page.getByLabel(msg('en', 'onboarding.create.owner_label')).fill('E2E Owner');
  await page.getByRole('button', { name: msg('en', 'onboarding.create.submit') }).click();
  await page.waitForURL(/\/en\/booking/);

  await page.getByRole('button', { name: msg('en', 'booking.calendar.add') }).click();
  const picker = page.getByRole('combobox', { name: new RegExp(msg('en', 'booking.form.event_type')) });
  await expect(picker).toBeVisible();
  const hint = page.getByText(msg('en', 'booking.event_type.marker_hint'), { exact: true });
  await expect(hint).toHaveCount(0); // default preset is bookable

  await picker.click();
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  const badgeText = msg('en', 'booking.event_type.marker_badge');
  const options = listbox.getByRole('option');
  const count = await options.count();
  expect(count).toBeGreaterThan(2);
  let badged = 0;
  for (let i = 0; i < count; i++) {
    const option = options.nth(i);
    const text = (await option.textContent()) ?? '';
    const hasBadge = (await option.locator('[data-marker-badge]').count()) > 0;
    const isMarker = /Lagan|Tilak/.test(text); // the two seeded marker-kind presets
    expect(hasBadge).toBe(isMarker);
    if (hasBadge) {
      badged++;
      await expect(option.locator('[data-marker-badge]')).toHaveText(badgeText);
      await expect(option.locator('[data-marker-badge] svg')).toBeVisible(); // flag icon
    }
  }
  expect(badged).toBe(2);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/picker-open-phone.png` });

  await listbox.getByRole('option', { name: /Lagan/ }).click();
  await expect(hint).toBeVisible();
  // Closed field: "icon label" only — the badge is not duplicated into the input.
  await expect(picker.locator('[data-marker-badge]')).toHaveCount(0);
  await expect(page.getByLabel(msg('en', 'booking.form.total_amount'))).toHaveCount(0);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/marker-selected-phone.png` });

  // Hindi: same badge + hint from the catalog.
  await page.keyboard.press('Escape');
  await page.goto('/hi/booking');
  await page.getByRole('button', { name: msg('hi', 'booking.calendar.add') }).click();
  await page.getByRole('combobox', { name: new RegExp(msg('hi', 'booking.form.event_type')) }).click();
  const hiListbox = page.getByRole('listbox');
  await expect(hiListbox.locator('[data-marker-badge]').first()).toHaveText(msg('hi', 'booking.event_type.marker_badge'));
  await hiListbox.locator('[data-marker-badge]').first().locator('xpath=ancestor::li[1]').click();
  await expect(page.getByText(msg('hi', 'booking.event_type.marker_hint'), { exact: true })).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/marker-selected-phone-hi.png` });
});
