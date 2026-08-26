import { expect, test } from '@playwright/test';
import { msg, type Locale } from './helpers';

// App shell navigation in both locales: the 4 sections render in the nav,
// and clicking through lands on localized pages (§1.2 — same 4 sections as
// left-nav on desktop / bottom-nav on mobile).
for (const locale of ['en', 'hi'] as Locale[]) {
  test.describe(`shell nav (${locale})`, () => {
    test('renders the 4 sections and navigates to Menu', async ({ page }) => {
      await page.goto(`/${locale}/booking`);

      const nav = page.getByRole('navigation');
      for (const section of ['booking', 'expenses', 'inventory', 'menu']) {
        await expect(nav.getByText(msg(locale, `common.nav.${section}`)).first()).toBeVisible();
      }

      await nav.getByText(msg(locale, 'common.nav.menu')).first().click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/menu$`));
      await expect(
        page.getByRole('heading', { name: msg(locale, 'menu.home.title') }),
      ).toBeVisible();

      // Menu hub lists Settings / Reports / About (Members is owner-gated).
      for (const key of ['settings', 'reports', 'about']) {
        await expect(page.getByText(msg(locale, `menu.section.${key}`)).first()).toBeVisible();
      }
    });

    test('settings page shows theme + language + sync rows', async ({ page }) => {
      await page.goto(`/${locale}/menu/settings`);
      await expect(
        page.getByRole('heading', { name: msg(locale, 'settings.title') }),
      ).toBeVisible();
      await expect(page.getByText(msg(locale, 'settings.language.title')).first()).toBeVisible();
      await expect(page.getByText(msg(locale, 'settings.theme.title')).first()).toBeVisible();
      await expect(page.getByText(msg(locale, 'settings.sync.title')).first()).toBeVisible();
      // Google-link stub row in its "not configured" state.
      await expect(page.getByText(msg(locale, 'settings.google.not_configured'))).toBeVisible();
    });

    test('language picker shows each language in its own script', async ({ page }) => {
      await page.goto(`/${locale}/menu/settings/language`);
      // Own-script names are identical in both catalogs by design. Scope to
      // the main region — the app-bar locale switcher shows one of them too.
      const main = page.getByRole('main');
      await expect(main.getByText(msg(locale, 'settings.language.name_en'))).toBeVisible();
      await expect(main.getByText(msg(locale, 'settings.language.name_hi'))).toBeVisible();
    });
  });
}

test('language switch navigates between locales', async ({ page }) => {
  await page.goto('/en/menu/settings/language');
  await page.getByRole('main').getByText(msg('en', 'settings.language.name_hi')).click();
  await expect(page).toHaveURL(/\/hi\/menu\/settings\/language$/);
  await expect(
    page.getByRole('heading', { name: msg('hi', 'settings.language.picker_title') }),
  ).toBeVisible();
});
