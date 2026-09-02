/**
 * Event-types manage page at a 320px-wide viewport (hermetic, guest mode):
 * the marker badge and colour dot must never overlap the reorder/edit/delete
 * buttons — a regression test for the absolutely-positioned secondaryAction
 * layout that let the badge slide under the arrows.
 */
import { expect, test } from '@playwright/test';
import { msg } from './helpers';

test.use({ viewport: { width: 320, height: 720 } });

function intersects(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

test('marker badge does not overlap the row action buttons at 320px', async ({ page }) => {
  // Guest mode: local seed includes the marker-kind Lagan/Tilak presets.
  await page.goto('/en/sign-in');
  await page.getByRole('button', { name: msg('en', 'onboarding.sign_in.continue_offline') }).click();
  await page.getByLabel(msg('en', 'onboarding.create.name_label')).fill('E2E Guest Hall');
  await page.getByLabel(msg('en', 'onboarding.create.owner_label')).fill('E2E Owner');
  await page.getByRole('button', { name: msg('en', 'onboarding.create.submit') }).click();
  await page.waitForURL(/\/en\/booking/);

  await page.goto('/en/menu/settings/event-types');
  await expect(
    page.getByRole('heading', { name: msg('en', 'settings.event_types.title') }),
  ).toBeVisible();

  const badges = page.getByText(msg('en', 'booking.marker.badge'), { exact: true });
  const badgeCount = await badges.count();
  expect(badgeCount).toBeGreaterThan(0); // seeded Lagan + Tilak markers

  for (let i = 0; i < badgeCount; i++) {
    const badge = badges.nth(i);
    const row = badge.locator('xpath=ancestor::li[1]');
    const badgeBox = await badge.boundingBox();
    expect(badgeBox).not.toBeNull();
    for (const label of [
      msg('en', 'settings.event_types.move_up'),
      msg('en', 'settings.event_types.move_down'),
      msg('en', 'common.action.edit'),
      msg('en', 'common.action.delete'),
    ]) {
      const buttonBox = await row.getByLabel(label, { exact: true }).boundingBox();
      expect(buttonBox).not.toBeNull();
      expect(intersects(badgeBox!, buttonBox!)).toBe(false);
    }
  }
});
