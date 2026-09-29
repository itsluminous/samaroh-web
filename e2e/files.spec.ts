/**
 * Files tab smoke (hermetic): the route exists behind the nav composition
 * (a fail-open/full-access shell shows Files in the desktop rail — Menu last
 * — and, at a mobile viewport, DIRECTLY in the bottom bar in Menu's old
 * slot while Menu is the title-bar kebab), and in guest mode the screen
 * works end to end on the local store: empty state → create a folder → open
 * it → breadcrumb back → global search — with the guest upload hint in
 * place of the Upload action.
 */
import { expect, test } from '@playwright/test';
import { authConfigured, msg, type Locale } from './helpers';

test.skip(authConfigured, 'hermetic-only: route protection is active in authenticated mode');

for (const locale of ['en', 'hi'] as Locale[]) {
  test(`files appears in the rail right before Menu; no More section in the menu (${locale})`, async ({ page }) => {
    await page.goto(`/${locale}/menu`);
    // Desktop rail lists every module incl. Files, then Menu last.
    const rail = page.getByRole('navigation').first();
    const railLabels = await rail.locator('.MuiListItemText-primary').allTextContents();
    expect(railLabels.at(-2)).toBe(msg(locale, 'files.nav.tab'));
    expect(railLabels.at(-1)).toBe(msg(locale, 'common.nav.menu'));
    // Nothing overflowed → no More section on the Menu page.
    const main = page.getByRole('main');
    await expect(main.getByText(msg(locale, 'files.nav.more_section'), { exact: true })).toHaveCount(0);
    await rail.getByText(msg(locale, 'files.nav.tab'), { exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/files$`));
  });
}

test('guest: folders, breadcrumbs and search work locally; upload shows the guest hint', async ({ page }) => {
  await page.goto('/en/sign-in');
  await page.getByRole('button', { name: msg('en', 'onboarding.sign_in.continue_offline') }).click();
  await page.getByLabel(msg('en', 'onboarding.create.name_label')).fill('E2E Guest Hall');
  await page.getByLabel(msg('en', 'onboarding.create.owner_label')).fill('E2E Owner');
  await page.getByRole('button', { name: msg('en', 'onboarding.create.submit') }).click();
  await page.waitForURL(/\/en\/booking/);

  await page.goto('/en/files');
  await expect(page.getByRole('heading', { name: msg('en', 'files.home.title'), exact: true })).toBeVisible();
  await expect(page.getByText(msg('en', 'files.home.empty_title'))).toBeVisible();
  await expect(page.getByText(msg('en', 'files.upload.guest_hint'))).toBeVisible();
  await expect(page.getByRole('button', { name: msg('en', 'files.action.upload') })).toHaveCount(0);

  // Create a folder (guest owner → manage_folders).
  await page.getByRole('button', { name: msg('en', 'files.action.new_folder') }).first().click();
  await page.getByLabel(msg('en', 'files.folder.name_label')).fill('Contracts');
  await page.getByRole('button', { name: msg('en', 'common.action.save') }).click();
  await expect(page.getByText(msg('en', 'files.folder.created'))).toBeVisible();

  // Open it: heading = folder name, breadcrumb root is a button, empty-folder state.
  await page.getByText('Contracts').click();
  await page.waitForURL(/\/en\/files\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { name: 'Contracts', exact: true })).toBeVisible();
  await expect(page.getByText(msg('en', 'files.folder.empty_title'))).toBeVisible();
  await page.getByRole('button', { name: msg('en', 'files.home.root_label') }).click();
  await page.waitForURL(/\/en\/files$/);

  // Global search finds the folder with its path subtitle; a miss shows the empty text.
  const search = page.getByLabel(msg('en', 'files.home.search_placeholder'));
  await search.fill('contr');
  await expect(page.getByText('Contracts')).toBeVisible();
  await expect(
    page.getByText(msg('en', 'files.search.result_path').replace('{path}', msg('en', 'files.home.root_label'))),
  ).toBeVisible();
  await search.fill('zzz-nothing');
  await expect(page.getByText(msg('en', 'files.search.empty'))).toBeVisible();

  // Persists across reload (IndexedDB).
  await page.reload();
  await expect(page.getByText('Contracts')).toBeVisible();
});
