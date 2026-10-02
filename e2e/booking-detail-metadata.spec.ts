/**
 * Booking detail at a PHONE viewport, hermetic guest mode: the notes line is
 * CONTENT (body size, text.primary) and the "Added by … on …" audit line is
 * METADATA (caption size, MONOSPACE, muted) — the two must not read alike
 * (owner feedback; Android applies the same labelSmall + monospace rule).
 * Screenshot lands in test-results/booking-detail-metadata/.
 */
import { expect, test } from '@playwright/test';
import { authConfigured, msg } from './helpers';

test.skip(authConfigured, 'hermetic-only: route protection is active in authenticated mode');

test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

const SHOTS = 'test-results/booking-detail-metadata';
const NOTES = 'Decor for the mandap, two extra chairs near the stage';

test('guest (phone): audit line is smaller + monospace, notes stay body text', async ({ page }) => {
  await page.goto('/en/sign-in');
  await page.getByRole('button', { name: msg('en', 'onboarding.sign_in.continue_offline') }).click();
  await page.getByLabel(msg('en', 'onboarding.create.name_label')).fill('E2E Guest Hall');
  await page.getByLabel(msg('en', 'onboarding.create.owner_label')).fill('E2E Owner');
  await page.getByRole('button', { name: msg('en', 'onboarding.create.submit') }).click();
  await page.waitForURL(/\/en\/booking/);

  // Create a booking dated today with notes.
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  await page.getByRole('button', { name: msg('en', 'booking.calendar.add') }).click();
  await page.getByLabel(msg('en', 'booking.form.customer_name')).fill('Priya Sharma');
  await page.getByLabel(msg('en', 'booking.form.start_date')).fill(iso);
  await page.getByLabel(msg('en', 'booking.form.end_date')).fill(iso);
  await page.getByLabel(msg('en', 'booking.form.notes')).fill(NOTES);
  await page.getByRole('button', { name: msg('en', 'common.action.save') }).click();

  // Open the detail drawer from the agenda/calendar row.
  await page.getByText('Priya Sharma').first().click();
  const notes = page.getByText(NOTES);
  await expect(notes).toBeVisible();
  const audit = page.locator('[data-metadata]').filter({ hasText: /^Added by/ });
  await expect(audit).toBeVisible();

  const notesStyle = await notes.evaluate((el) => {
    const s = getComputedStyle(el);
    return { fontFamily: s.fontFamily, fontSize: parseFloat(s.fontSize) };
  });
  const auditStyle = await audit.evaluate((el) => {
    const s = getComputedStyle(el);
    return { fontFamily: s.fontFamily, fontSize: parseFloat(s.fontSize) };
  });
  expect(auditStyle.fontFamily).toMatch(/mono/i);
  expect(notesStyle.fontFamily).not.toMatch(/mono/i);
  expect(auditStyle.fontSize).toBeLessThan(notesStyle.fontSize);

  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/booking-detail-phone.png` });
});
