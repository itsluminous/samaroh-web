/**
 * Files tab — rename + move (owner feedback 2026-09-30) at a PHONE viewport,
 * hermetic guest mode (local store, guest owner has every permission):
 * nested folders → the move picker opens with ROOT folders only + expand
 * chevrons (lazy tree), near full width; rename prefilled; move updates the
 * listing. Screenshots of the picker / rename dialog land in test-results/.
 */
import { expect, test } from '@playwright/test';
import { authConfigured, msg } from './helpers';

test.skip(authConfigured, 'hermetic-only: route protection is active in authenticated mode');

test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

const SHOTS = 'test-results/files-rename-move';

/** Lets the MUI dialog fade finish so the capture is not mid-transition. */
const shot = async (page: import('@playwright/test').Page, name: string) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

test('guest (phone): lazy move picker, sizing, rename + move folder', async ({ page }) => {
  await page.goto('/en/sign-in');
  await page.getByRole('button', { name: msg('en', 'onboarding.sign_in.continue_offline') }).click();
  await page.getByLabel(msg('en', 'onboarding.create.name_label')).fill('E2E Guest Hall');
  await page.getByLabel(msg('en', 'onboarding.create.owner_label')).fill('E2E Owner');
  await page.getByRole('button', { name: msg('en', 'onboarding.create.submit') }).click();
  await page.waitForURL(/\/en\/booking/);
  await page.goto('/en/files');
  await expect(page.getByRole('heading', { name: msg('en', 'files.home.title'), exact: true })).toBeVisible();

  const newFolder = async (name: string) => {
    await page.getByRole('button', { name: msg('en', 'files.action.new_folder') }).first().click();
    await page.getByLabel(msg('en', 'files.folder.name_label')).fill(name);
    await page.getByRole('button', { name: msg('en', 'common.action.save') }).click();
    await expect(page.getByLabel(msg('en', 'files.folder.name_label'))).toHaveCount(0);
  };

  // Contracts / 2026 ; Photos (root)
  await newFolder('Contracts');
  await newFolder('Photos');
  await page.getByText('Contracts', { exact: true }).click();
  await page.waitForURL(/\/en\/files\/[0-9a-f-]+$/);
  await newFolder('2026');
  await page.getByRole('button', { name: msg('en', 'files.home.root_label') }).click();
  await page.waitForURL(/\/en\/files$/);

  // Rename a folder: prefilled dialog.
  await page.getByRole('button', { name: msg('en', 'files.action.more').replace('{name}', 'Photos') }).click();
  await page.getByRole('menuitem', { name: msg('en', 'files.action.rename_folder') }).click();
  const nameField = page.getByLabel(msg('en', 'files.folder.name_label'));
  await expect(nameField).toHaveValue('Photos');
  await shot(page, 'rename-folder-mobile');
  await nameField.fill('Pictures');
  await page.getByRole('button', { name: msg('en', 'common.action.save') }).click();
  await expect(page.getByText(msg('en', 'files.folder.renamed'))).toBeVisible();
  await expect(page.getByText('Pictures', { exact: true })).toBeVisible();

  // Move Pictures into Contracts/2026 through the lazy picker.
  await page.getByRole('button', { name: msg('en', 'files.action.more').replace('{name}', 'Pictures') }).click();
  await page.getByRole('menuitem', { name: msg('en', 'files.action.move') }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(msg('en', 'files.move.title'))).toBeVisible();
  // Root folders only (Pictures itself is hidden — it cannot be its own destination).
  const rows = dialog.getByRole('treeitem');
  await expect(rows).toHaveCount(2); // All files, Contracts
  await expect(dialog.getByRole('treeitem', { name: /2026/ })).toHaveCount(0);
  // Near full width on the phone viewport (MUI default would be 296 px at 360).
  // (MUI puts role="dialog" on the Paper itself.)
  const box = await dialog.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(340);
  await shot(page, 'move-picker-root-only-mobile');
  await dialog.getByRole('button', { name: msg('en', 'files.picker.expand').replace('{name}', 'Contracts') }).click();
  await expect(rows).toHaveCount(3);
  await dialog.getByRole('treeitem', { name: /2026/ }).click();
  await expect(
    dialog.getByText(msg('en', 'files.move.selected_hint').replace('{path}', `${msg('en', 'files.home.root_label')} › Contracts › 2026`)),
  ).toBeVisible();
  await shot(page, 'move-picker-expanded-mobile');
  await dialog.getByRole('button', { name: msg('en', 'files.move.confirm') }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(msg('en', 'files.move.done').replace('{folder}', '2026'))).toBeVisible();
  // Gone from the top level, present under Contracts/2026.
  await expect(page.getByText('Pictures', { exact: true })).toHaveCount(0);
  await page.getByText('Contracts', { exact: true }).click();
  await page.getByText('2026', { exact: true }).click();
  await expect(page.getByRole('heading', { name: '2026', exact: true })).toBeVisible();
  await expect(page.getByText('Pictures', { exact: true })).toBeVisible();
  await shot(page, 'after-move-mobile');
});
