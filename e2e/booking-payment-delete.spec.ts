/**
 * Delete a recorded payment at a PHONE viewport, hermetic guest mode:
 * record → open card → trash on the payment row → confirmation (amount +
 * date) → confirm → row gone, due recomputed, "Payment deleted" snackbar.
 * The guest (Dexie) store takes the tombstone through the same write path
 * as Supabase. Screenshots land in test-results/booking-payment-delete/.
 */
import { expect, test } from '@playwright/test';
import { authConfigured, msg } from './helpers';

test.skip(authConfigured, 'hermetic-only: route protection is active in authenticated mode');

test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

const SHOTS = 'test-results/booking-payment-delete';

test('guest (phone): record → delete → confirm → payment gone, due recomputed', async ({ page }) => {
  await page.goto('/en/sign-in');
  await page.getByRole('button', { name: msg('en', 'onboarding.sign_in.continue_offline') }).click();
  await page.getByLabel(msg('en', 'onboarding.create.name_label')).fill('E2E Guest Hall');
  await page.getByLabel(msg('en', 'onboarding.create.owner_label')).fill('E2E Owner');
  await page.getByRole('button', { name: msg('en', 'onboarding.create.submit') }).click();
  await page.waitForURL(/\/en\/booking/);

  // Booking dated today with a ₹30,000 advance → payment row #1.
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  await page.getByRole('button', { name: msg('en', 'booking.calendar.add') }).click();
  await page.getByLabel(msg('en', 'booking.form.customer_name')).fill('Priya Sharma');
  await page.getByLabel(msg('en', 'booking.form.start_date')).fill(iso);
  await page.getByLabel(msg('en', 'booking.form.end_date')).fill(iso);
  await page.getByLabel(msg('en', 'booking.form.total_amount')).fill('100000');
  await page.getByLabel(msg('en', 'booking.form.advance')).fill('30000');
  await page.getByRole('button', { name: msg('en', 'common.action.save') }).click();

  // Open the card: one payment row, due = 70,000.
  await page.getByText('Priya Sharma').first().click();
  const drawer = page.getByRole('presentation').filter({ hasText: msg('en', 'booking.card.payments_title') });
  const rows = drawer.getByTestId('payment-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('30,000');
  await expect(drawer.getByText('70,000')).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/1-payment-row-trash.png` });

  // Trash → confirmation dialog quoting the amount + date.
  const trash = rows.first().getByRole('button', { name: msg('en', 'booking.payment.delete') });
  await expect(trash).toBeVisible();
  await trash.click();
  const dialog = page.getByRole('dialog').filter({ hasText: msg('en', 'booking.payment.delete_confirm_title') });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('30,000');
  await expect(dialog).not.toContainText('{amount}');
  await page.waitForTimeout(400); // let the dialog fade-in settle before the shot
  await page.screenshot({ path: `${SHOTS}/2-confirm-dialog.png` });

  // Dismiss first: nothing changes.
  await dialog.getByRole('button', { name: msg('en', 'common.action.cancel') }).click();
  await expect(dialog).toBeHidden();
  await expect(rows).toHaveCount(1);

  // Confirm: row gone, due back to the full total, snackbar.
  await trash.click();
  await dialog.getByRole('button', { name: msg('en', 'booking.payment.delete') }).click();
  await expect(page.getByText(msg('en', 'booking.payment.deleted'))).toBeVisible();
  await expect(rows).toHaveCount(0);
  await expect(drawer.getByText(msg('en', 'booking.card.no_payments'))).toBeVisible();
  await expect(drawer.getByText('1,00,000')).toHaveCount(2); // Total + Due
  await page.screenshot({ path: `${SHOTS}/3-after-delete.png` });

  // The tombstone survives a reload (Dexie), the row stays gone.
  await page.reload();
  await page.getByText('Priya Sharma').first().click();
  await expect(page.getByText(msg('en', 'booking.card.no_payments'))).toBeVisible();
  await expect(page.getByTestId('payment-row')).toHaveCount(0);
});
