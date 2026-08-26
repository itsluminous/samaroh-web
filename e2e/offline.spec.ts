import { expect, test } from '@playwright/test';
import { msg } from './helpers';

// Offline smoke (§8 / §1.2 read-only offline cache): after one online visit
// the service worker (public/sw.js) must serve the app shell from cache.
// Runs against the production server (SW registers in production only).
test('app shell loads from the service-worker cache when offline', async ({ page, context }) => {
  await page.goto('/en/menu');
  // Wait until the SW controls the page, then prime the page cache with a
  // second navigation (the first response raced the SW registration).
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: msg('en', 'menu.home.title') })).toBeVisible();

  await context.setOffline(true);
  try {
    await page.reload();
    await expect(
      page.getByRole('heading', { name: msg('en', 'menu.home.title') }),
    ).toBeVisible();
    // Client-side nav to another cached-asset route also works offline.
    await page.getByRole('navigation').getByText(msg('en', 'common.nav.menu')).first().click();
    await expect(page).toHaveURL(/\/en\/menu$/);
  } finally {
    await context.setOffline(false);
  }
});
