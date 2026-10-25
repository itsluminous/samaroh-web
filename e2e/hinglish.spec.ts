/**
 * Hinglish (`hi-Latn`) end to end, hermetic:
 *   - the language picker lists Hinglish; picking it moves to /hi-Latn/… and
 *     the document is tagged lang="hi-Latn" with hreflang alternates for all
 *     three locales;
 *   - in guest mode (a local business exists, so the calendar renders) the
 *     booking page shows Hinglish labels from the generated hi-Latn catalog —
 *     nav, add-booking button, month controls — with Latin-script dates;
 *   - Menu → Help in hi-Latn lists the guide screens in Hinglish, the title bar
 *     has "Help for this screen" in Hinglish, and <link rel="help"> points at
 *     the public /help/hi-Latn/ pages.
 * Expected copy comes from messages/hi-Latn.json; nothing is hardcoded.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { authConfigured, msg } from './helpers';

test.skip(authConfigured, 'hermetic-only: route protection is active in authenticated mode');

interface GuideScreen {
  id: string;
  title: Record<string, string>;
  platforms?: string[];
}
interface Guide {
  site: { baseUrl: string };
  screens: GuideScreen[];
}

const guide = JSON.parse(
  readFileSync(join(__dirname, '..', 'src', 'generated', 'help', 'guide.json'), 'utf8'),
) as Guide;
const webScreens = guide.screens.filter((s) => !s.platforms || s.platforms.includes('web'));
const DEVANAGARI = /[\u0900-\u097F]/;

async function enterGuestMode(page: import('@playwright/test').Page) {
  await page.goto('/en/sign-in');
  await page.getByRole('button', { name: msg('en', 'onboarding.sign_in.continue_offline') }).click();
  await page.getByLabel(msg('en', 'onboarding.create.name_label')).fill('E2E Hinglish Hall');
  await page.getByLabel(msg('en', 'onboarding.create.owner_label')).fill('E2E Owner');
  await page.getByRole('button', { name: msg('en', 'onboarding.create.submit') }).click();
  await page.waitForURL(/\/en\/booking/);
}

test('switch to Hinglish: picker → /hi-Latn, lang + hreflang, booking page in Hinglish', async ({ page }) => {
  await enterGuestMode(page);

  await page.goto('/en/menu/settings/language');
  const main = page.getByRole('main');
  await expect(main.getByText(msg('en', 'settings.language.name_hi_latn'))).toBeVisible();
  await main.getByText(msg('en', 'settings.language.name_hi_latn')).click();
  await expect(page).toHaveURL(/\/hi-Latn\/menu\/settings\/language$/);
  await expect(page.getByRole('heading', { name: msg('hi-Latn', 'settings.language.picker_title') })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi-Latn');
  // Only the Hinglish row is selected (exact tag match — never the Hindi row too).
  await expect(main.locator('.Mui-selected')).toHaveCount(1);
  await expect(main.locator('.Mui-selected')).toHaveText(msg('hi-Latn', 'settings.language.name_hi_latn'));

  // hreflang alternates in the document for every locale + x-default.
  for (const [hreflang, href] of [
    ['en', '/en/menu/settings/language'],
    ['hi', '/hi/menu/settings/language'],
    ['hi-Latn', '/hi-Latn/menu/settings/language'],
    ['x-default', '/en/menu/settings/language'],
  ]) {
    await expect(page.locator(`link[rel="alternate"][hreflang="${hreflang}"]`)).toHaveAttribute('href', href!);
  }

  // The choice persists: the bare root now lands on Hinglish.
  await page.goto('/');
  await expect(page).toHaveURL(/\/hi-Latn\/booking$/);

  // Booking page: Hinglish labels, Latin-script dates.
  const nav = page.getByRole('navigation');
  for (const section of ['booking', 'expenses', 'inventory', 'menu']) {
    await expect(nav.getByText(msg('hi-Latn', `common.nav.${section}`)).first()).toBeVisible();
  }
  await expect(page.getByRole('button', { name: msg('hi-Latn', 'booking.calendar.add') })).toBeVisible();
  await expect(page.getByLabel(msg('hi-Latn', 'booking.calendar.prev_month'))).toBeVisible();
  await expect(page.getByLabel(msg('hi-Latn', 'booking.calendar.next_month'))).toBeVisible();
  const mainText = (await page.getByRole('main').innerText()).replace(/\s+/g, ' ');
  expect(mainText).not.toMatch(DEVANAGARI);
  // English month name (en-IN formatting) somewhere in the calendar header.
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  expect(months.some((m) => mainText.includes(m))).toBe(true);
  await page.screenshot({ path: 'test-results/hinglish-booking.png', scale: 'css' });
});

test('Help in Hinglish: guide screens, "Help for this screen", rel=help → /help/hi-Latn/', async ({ page }) => {
  await page.goto('/hi-Latn/menu');
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi-Latn');
  const row = page.getByRole('main').getByRole('link', { name: new RegExp(`^${msg('hi-Latn', 'common.menu.help')}`) });
  await row.click();
  await expect(page).toHaveURL(/\/hi-Latn\/menu\/help$/);
  await expect(page.getByRole('heading', { level: 1, name: msg('hi-Latn', 'common.menu.help') })).toBeVisible();
  await expect(page.getByText(msg('hi-Latn', 'menu.help.intro'))).toBeVisible();
  for (const screen of webScreens) {
    await expect(page.getByRole('heading', { level: 2, name: screen.title['hi-Latn'] })).toBeVisible();
  }
  await expect(page.locator('link[rel="help"]')).toHaveAttribute('href', `${guide.site.baseUrl}hi-Latn/index.html`);
  // No Hindi-script leakage on the Hinglish Help page.
  expect(await page.getByRole('main').innerText()).not.toMatch(DEVANAGARI);

  // Contextual help from another screen, in Hinglish.
  await page.goto('/hi-Latn/inventory/masterlist');
  await expect(page.locator('link[rel="help"]')).toHaveAttribute('href', `${guide.site.baseUrl}hi-Latn/inventory_masterlist.html`);
  await page.getByRole('banner').getByRole('link', { name: msg('hi-Latn', 'menu.help.for_this_screen') }).click();
  await expect(page).toHaveURL(/\/hi-Latn\/menu\/help\?hl=inventory_masterlist$/);
  const section = page.locator('#hl-inventory_masterlist');
  await expect(section).toBeInViewport();
  await expect(
    section.getByRole('heading', { level: 2, name: guide.screens.find((s) => s.id === 'inventory_masterlist')!.title['hi-Latn'] }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/hinglish-help.png', scale: 'css' });
});
