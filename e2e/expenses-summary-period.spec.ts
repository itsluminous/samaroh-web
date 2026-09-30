/**
 * Expenses tab — summary period switch at a PHONE viewport, hermetic guest
 * mode (local store): the totals card carries a This month / This year /
 * All time segmented control, THIS MONTH is selected by default, the choice
 * survives a reload (localStorage), and the two amounts stay on one line.
 * Screenshots land in test-results/expenses-summary-period/.
 */
import { expect, test } from '@playwright/test';
import { authConfigured, msg } from './helpers';

test.skip(authConfigured, 'hermetic-only: route protection is active in authenticated mode');

test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

const SHOTS = 'test-results/expenses-summary-period';

test('guest (phone): default This month, switch, persist across reload', async ({ page }) => {
  await page.goto('/en/sign-in');
  await page.getByRole('button', { name: msg('en', 'onboarding.sign_in.continue_offline') }).click();
  await page.getByLabel(msg('en', 'onboarding.create.name_label')).fill('E2E Guest Hall');
  await page.getByLabel(msg('en', 'onboarding.create.owner_label')).fill('E2E Owner');
  await page.getByRole('button', { name: msg('en', 'onboarding.create.submit') }).click();
  await page.waitForURL(/\/en\/booking/);

  await page.goto('/en/expenses');
  const group = page.getByRole('group', { name: msg('en', 'expenses.summary.period_label') });
  await expect(group).toBeVisible();

  const month = group.getByRole('button', { name: msg('en', 'expenses.summary.period_month') });
  const year = group.getByRole('button', { name: msg('en', 'expenses.summary.period_year') });
  const all = group.getByRole('button', { name: msg('en', 'expenses.summary.period_all') });

  await expect(month).toHaveAttribute('aria-pressed', 'true');
  await expect(year).toHaveAttribute('aria-pressed', 'false');
  await expect(all).toHaveAttribute('aria-pressed', 'false');

  // The whole control fits the 360 px card: no segment wraps.
  for (const segment of [month, year, all]) {
    const box = await segment.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeLessThan(48);
  }

  // Both amounts render as a single line (autoshrink, no wrap).
  for (const id of ['summary-gave', 'summary-got']) {
    const amount = page.getByTestId(id);
    await expect(amount).toBeVisible();
    const lineHeight = await amount.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
    const box = await amount.boundingBox();
    expect(box!.height).toBeLessThanOrEqual(lineHeight + 1);
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/default-this-month.png` });

  await year.click();
  await expect(year).toHaveAttribute('aria-pressed', 'true');
  await expect(month).toHaveAttribute('aria-pressed', 'false');
  await page.screenshot({ path: `${SHOTS}/this-year.png` });

  await all.click();
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: `${SHOTS}/all-time.png` });

  // Persisted: a reload restores ALL TIME.
  await page.reload();
  await expect(
    page
      .getByRole('group', { name: msg('en', 'expenses.summary.period_label') })
      .getByRole('button', { name: msg('en', 'expenses.summary.period_all') }),
  ).toHaveAttribute('aria-pressed', 'true');
});
