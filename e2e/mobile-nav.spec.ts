/**
 * Mobile web chrome (hermetic, 390×844): owner feedback 2026-09-29.
 *   - The title bar has NO sign-out icon; the ⋮ kebab sits right of the
 *     sync icon and opens the existing Menu route (search field intact).
 *   - The bottom bar is modules only — Files sits directly in Menu's old
 *     slot (5 tabs for a fail-open/full-access shell); no Menu tab.
 *   - Guest mode: the Menu identity row offers Sign in (the guest-mode
 *     counterpart of sign-out).
 * Also captures a downscaled screenshot for the visual check
 * (test-results/mobile-nav-*.png).
 */
import { expect, test } from '@playwright/test';
import { authConfigured, msg } from './helpers';

test.skip(authConfigured, 'hermetic-only: route protection is active in authenticated mode');
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('mobile: kebab → Menu, Files in the bottom bar, no sign-out icon in the title bar', async ({ page }) => {
  await page.goto('/en/booking');

  // Title bar: no sign-out affordance, kebab present (right-most control).
  const banner = page.getByRole('banner');
  await expect(banner.getByLabel(msg('en', 'auth.action.sign_out'))).toHaveCount(0);
  await expect(banner.locator('form[action="/auth/sign-out"]')).toHaveCount(0);
  const kebab = banner.getByRole('link', { name: msg('en', 'common.nav.menu') });
  await expect(kebab).toBeVisible();
  // Right-most toolbar control (the sync icon, when it renders — it needs a
  // server — sits to its left; the jest suite pins that order).
  await expect(banner.locator('.MuiToolbar-root > :last-child')).toHaveAttribute('href', '/en/menu');

  // Bottom bar: five module tabs, Files last, no Menu tab.
  const bar = page.locator('.MuiBottomNavigation-root');
  await expect(bar).toBeVisible();
  const tabs = await bar.locator('.MuiBottomNavigationAction-root').allTextContents();
  expect(tabs).toEqual([
    msg('en', 'common.nav.booking'),
    msg('en', 'common.nav.expenses'),
    msg('en', 'common.nav.inventory'),
    msg('en', 'notes.nav.tab'),
    msg('en', 'files.nav.tab'),
  ]);
  await page.screenshot({ path: 'test-results/mobile-nav-booking.png', scale: 'css' });

  // Files tab navigates directly.
  await bar.getByText(msg('en', 'files.nav.tab'), { exact: true }).click();
  await expect(page).toHaveURL(/\/en\/files$/);

  // Kebab opens the Menu page with its search field and rows.
  await kebab.click();
  await expect(page).toHaveURL(/\/en\/menu$/);
  await expect(page.getByRole('heading', { name: msg('en', 'menu.home.title') })).toBeVisible();
  await expect(page.getByLabel(msg('en', 'menu.search.placeholder'))).toBeVisible();
  for (const key of ['settings', 'reports', 'about']) {
    await expect(page.getByText(msg('en', `menu.section.${key}`)).first()).toBeVisible();
  }
  await page.screenshot({ path: 'test-results/mobile-nav-menu.png', scale: 'css' });
});

test('mobile guest: kebab → Menu shows Sign in on the identity row (no sign-out anywhere)', async ({ page }) => {
  await page.goto('/en/sign-in');
  await page.getByRole('button', { name: msg('en', 'onboarding.sign_in.continue_offline') }).click();
  await page.getByLabel(msg('en', 'onboarding.create.name_label')).fill('E2E Guest Hall');
  await page.getByLabel(msg('en', 'onboarding.create.owner_label')).fill('E2E Owner');
  await page.getByRole('button', { name: msg('en', 'onboarding.create.submit') }).click();
  await page.waitForURL(/\/en\/booking/);

  await page.getByRole('banner').getByRole('link', { name: msg('en', 'common.nav.menu') }).click();
  await expect(page).toHaveURL(/\/en\/menu$/);
  const main = page.getByRole('main');
  await expect(main.getByText(msg('en', 'menu.identity.not_signed_in'))).toBeVisible();
  await expect(page.getByLabel(msg('en', 'menu.identity.sign_out'))).toHaveCount(0);
  await page.screenshot({ path: 'test-results/mobile-nav-guest-menu.png', scale: 'css' });
  // The guest banner's own Sign in CTA is also on the page — target the identity row.
  await main.locator('#hl-identity').getByRole('link', { name: msg('en', 'menu.identity.sign_in') }).click();
  await page.waitForURL(/\/en\/sign-in/);
  await expect(page.getByRole('heading', { name: msg('en', 'auth.sign_in.title') })).toBeVisible();
});
