/**
 * Reports quick filter at a PHONE viewport, hermetic guest mode (shared
 * docs/reports-range-filter.md): the six chips render in order on ONE
 * scrolling line (never wrap), −12 months is pressed by default, tapping
 * +3 months switches the active chip. Screenshot in
 * test-results/reports-range-filter/.
 */
import { expect, test } from '@playwright/test';
import { authConfigured, msg } from './helpers';

test.skip(authConfigured, 'hermetic-only: route protection is active in authenticated mode');

test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

const SHOTS = 'test-results/reports-range-filter';
const ORDER = ['minus_12m', 'minus_3m', 'this_month', 'plus_3m', 'plus_12m', 'custom'] as const;

test('guest (phone): chips in order, single line, default −12 months', async ({ page }) => {
  await page.goto('/en/sign-in');
  await page.getByRole('button', { name: msg('en', 'onboarding.sign_in.continue_offline') }).click();
  await page.getByLabel(msg('en', 'onboarding.create.name_label')).fill('E2E Guest Hall');
  await page.getByLabel(msg('en', 'onboarding.create.owner_label')).fill('E2E Owner');
  await page.getByRole('button', { name: msg('en', 'onboarding.create.submit') }).click();
  await page.waitForURL(/\/en\/booking/);

  await page.goto('/en/menu/reports/revenue');
  const row = page.getByTestId('report-range-chips');
  await expect(row).toBeVisible();
  const chips = row.getByRole('button');
  await expect(chips).toHaveCount(6);
  await expect(chips).toHaveText(ORDER.map((k) => msg('en', `reports.range.${k}`)));
  await expect(chips.nth(0)).toHaveAttribute('aria-pressed', 'true');

  // One line: every chip shares the same top offset; the row scrolls instead of wrapping.
  const tops = await chips.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  const rowMetrics = await row.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(rowMetrics.scroll).toBeGreaterThanOrEqual(rowMetrics.client);
  await page.screenshot({ path: `${SHOTS}/reports-chips-default-phone.png` });

  await chips.nth(3).scrollIntoViewIfNeeded();
  await chips.nth(3).click();
  await expect(chips.nth(3)).toHaveAttribute('aria-pressed', 'true');
  await expect(chips.nth(0)).toHaveAttribute('aria-pressed', 'false');
  await page.screenshot({ path: `${SHOTS}/reports-chips-plus3m-phone.png` });
});
