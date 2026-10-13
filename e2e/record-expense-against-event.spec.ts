/**
 * Record an expense against an event at a PHONE viewport, hermetic guest
 * mode (shared/docs/expense-against-event.md rev 2): the booking card's
 * "Record expense" opens the entry dialog pre-filled (the ENGLISH event party
 * name `Wedding - dd-MMM-yyyy - Priya Sharma`, You gave, notes `{eventType} ·
 * {dates}`), saving creates the event party + one linked entry; the party
 * ledger shows "Show event" on the entry row AND once in the header (event
 * party); tapping it lands back on the booking's detail drawer, whose
 * "Expenses history" lists the entry with its total. Screenshots in
 * test-results/record-expense-against-event/.
 */
import { expect, test } from '@playwright/test';
import { authConfigured, msg } from './helpers';

test.skip(authConfigured, 'hermetic-only: route protection is active in authenticated mode');

test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

const SHOTS = 'test-results/record-expense-against-event';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

test('guest (phone): record expense → ledger Show event → booking card with Expenses history', async ({ page }) => {
  await page.goto('/en/sign-in');
  await page.getByRole('button', { name: msg('en', 'onboarding.sign_in.continue_offline') }).click();
  await page.getByLabel(msg('en', 'onboarding.create.name_label')).fill('E2E Guest Hall');
  await page.getByLabel(msg('en', 'onboarding.create.owner_label')).fill('E2E Owner');
  await page.getByRole('button', { name: msg('en', 'onboarding.create.submit') }).click();
  await page.waitForURL(/\/en\/booking/);

  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  // Contract §2.1 date segment: dd-MMM-yyyy, English month.
  const partyDate = `${String(today.getDate()).padStart(2, '0')}-${MONTHS[today.getMonth()]}-${today.getFullYear()}`;
  await page.getByRole('button', { name: msg('en', 'booking.calendar.add') }).click();
  await page.getByLabel(msg('en', 'booking.form.customer_name')).fill('Priya Sharma');
  await page.getByLabel(msg('en', 'booking.form.customer_phone')).fill('9876543210');
  await page.getByLabel(msg('en', 'booking.form.start_date')).fill(iso);
  await page.getByLabel(msg('en', 'booking.form.end_date')).fill(iso);
  await page.getByRole('button', { name: msg('en', 'common.action.save') }).click();

  // Open the card → no Expenses history yet (hidden entirely) → Record expense.
  await page.getByText('Priya Sharma').first().click();
  await expect(page.getByRole('button', { name: msg('en', 'booking.card.action_record_payment') })).toBeVisible();
  await expect(page.getByText(msg('en', 'booking.card.expenses_history'))).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/1-booking-card-phone.png` });
  await page.getByRole('button', { name: msg('en', 'booking.card.action_record_expense') }).click();

  const dialog = page.getByRole('dialog').filter({ hasText: msg('en', 'booking.card.action_record_expense') });
  // The event party name: `{EventTypeLabel} - {dd-MMM-yyyy} - {Customer}` (English, seeded preset label).
  const partyName = await dialog.getByTestId('entry-party-name').textContent();
  expect(partyName).toMatch(new RegExp(`^.+ - ${partyDate} - Priya Sharma$`));
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

  // The card now lists the entry under Expenses history with its total.
  const history = page.getByTestId('expenses-history');
  await expect(history.getByText(msg('en', 'booking.card.expenses_history'))).toBeVisible();
  await expect(history.getByTestId('expense-row')).toHaveCount(1);
  await expect(history.getByText(msg('en', 'booking.card.expenses_total'))).toBeVisible();
  await expect(history.getByText(/2,500/)).toHaveCount(2); // row + total
  await page.screenshot({ path: `${SHOTS}/3-booking-card-expenses-history-phone.png` });

  // Expenses → the auto-created EVENT party → its ledger shows "Show event" on the
  // row and once in the header.
  await page.goto('/en/expenses');
  await page.getByText(partyName!).first().click();
  await page.waitForURL(/\/en\/expenses\//);
  await expect(page.getByTestId('party-show-event')).toHaveText(msg('en', 'expenses.ledger.show_event'));
  await expect(page.getByTestId('entry-show-event')).toHaveText(msg('en', 'expenses.ledger.show_event'));
  await expect(page.getByText(msg('en', 'expenses.ledger.event_chip').split('{label}')[0]!.trim())).toHaveCount(0); // retired
  await page.screenshot({ path: `${SHOTS}/4-ledger-show-event-phone.png` });

  // Tap the row's control → the booking's detail drawer on the Booking page.
  await page.getByTestId('entry-show-event').click();
  await page.waitForURL(/\/en\/booking\?open=/);
  await expect(page.getByRole('button', { name: msg('en', 'booking.card.action_record_expense') })).toBeVisible();
  await expect(page.getByText(`${msg('en', 'booking.card.dates_label')}:`, { exact: false })).toBeVisible();
  await expect(page.getByTestId('expenses-history').getByTestId('expense-row')).toHaveCount(1);
  await page.screenshot({ path: `${SHOTS}/5-booking-detail-from-show-event-phone.png` });
});
