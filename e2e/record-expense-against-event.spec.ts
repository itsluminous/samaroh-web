/**
 * Record an expense against an event at a PHONE viewport, hermetic guest
 * mode (shared/docs/expense-against-event.md): the booking card's "Record
 * expense" opens the entry dialog pre-filled (customer, You gave, notes
 * `{eventType} · {dates}`), saving creates the customer's party + one linked
 * entry, the party ledger shows the `Event: Priya · Wedding` chip and tapping
 * it lands back on the booking's detail drawer. Screenshots in
 * test-results/record-expense-against-event/.
 */
import { expect, test } from '@playwright/test';
import { authConfigured, msg } from './helpers';

test.skip(authConfigured, 'hermetic-only: route protection is active in authenticated mode');

test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

const SHOTS = 'test-results/record-expense-against-event';

test('guest (phone): record expense → ledger chip → back to the booking', async ({ page }) => {
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
  await page.getByLabel(msg('en', 'booking.form.customer_phone')).fill('9876543210');
  await page.getByLabel(msg('en', 'booking.form.start_date')).fill(iso);
  await page.getByLabel(msg('en', 'booking.form.end_date')).fill(iso);
  await page.getByRole('button', { name: msg('en', 'common.action.save') }).click();

  // Open the card → Record expense (beside Record payment).
  await page.getByText('Priya Sharma').first().click();
  await expect(page.getByRole('button', { name: msg('en', 'booking.card.action_record_payment') })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/1-booking-card-phone.png` });
  await page.getByRole('button', { name: msg('en', 'booking.card.action_record_expense') }).click();

  const dialog = page.getByRole('dialog').filter({ hasText: msg('en', 'booking.card.action_record_expense') });
  await expect(dialog.getByTestId('entry-party-name')).toHaveText('Priya Sharma');
  await expect(dialog.getByRole('button', { name: msg('en', 'expenses.home.you_gave') })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const notes = dialog.getByLabel(msg('en', 'expenses.entry.notes_label'));
  await expect(notes).toHaveValue(/^.+ \u00B7 .+$/); // `{eventType} · {dates}`
  await page.screenshot({ path: `${SHOTS}/2-entry-dialog-prefilled-phone.png` });
  await dialog.getByLabel(msg('en', 'expenses.entry.amount_label')).fill('2500');
  await dialog.getByRole('button', { name: msg('en', 'common.action.save') }).click();
  await expect(dialog).toBeHidden();

  // Expenses → the auto-created party → its ledger shows the event chip.
  await page.goto('/en/expenses');
  await page.getByText('Priya Sharma').first().click();
  await page.waitForURL(/\/en\/expenses\//);
  const chipLabel = msg('en', 'expenses.ledger.event_chip').replace('{label}', 'Priya \u00B7 ');
  const chip = page.locator('[data-event-chip]');
  await expect(chip).toHaveText(new RegExp(`^${chipLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  await page.screenshot({ path: `${SHOTS}/3-ledger-chip-phone.png` });

  // Tap → the booking's detail drawer on the Booking page.
  await chip.click();
  await page.waitForURL(/\/en\/booking\?open=/);
  await expect(page.getByRole('button', { name: msg('en', 'booking.card.action_record_expense') })).toBeVisible();
  await expect(page.getByText(`${msg('en', 'booking.card.dates_label')}:`, { exact: false })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/4-booking-detail-from-chip-phone.png` });
});
