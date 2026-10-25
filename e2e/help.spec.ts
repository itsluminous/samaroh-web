/**
 * Menu → Help (Android parity), hermetic:
 *   - Menu home has the Help row (shared `common.menu.help`) in all locales;
 *     the Help page lists the guide's screens in the UI language with search.
 *   - "Show me" on a task navigates to the task's route; for a sheet-style
 *     task (Add a booking) the web opens the same dialog via `?action=` —
 *     exercised in guest mode, where a local business exists so the booking
 *     screen has permissions to act on.
 *   - The title bar's "Help for this screen" button opens Help scrolled to the
 *     current screen's section, and every page carries <link rel="help"> to
 *     the public guide page.
 * Expected copy comes from the generated catalogs; the guide content from the
 * copied shared guide (src/generated/help/guide.json).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { LOCALES, authConfigured, msg, type Locale } from './helpers';

test.skip(authConfigured, 'hermetic-only: route protection is active in authenticated mode');

interface GuideTask {
  id: string;
  title: Record<Locale, string>;
  platforms?: string[];
}
interface GuideScreen {
  id: string;
  title: Record<Locale, string>;
  platforms?: string[];
  tasks: GuideTask[];
}
interface Guide {
  site: { baseUrl: string };
  screens: GuideScreen[];
}

const guide = JSON.parse(
  readFileSync(join(__dirname, '..', 'src', 'generated', 'help', 'guide.json'), 'utf8'),
) as Guide;
const webScreens = guide.screens.filter((s) => !s.platforms || s.platforms.includes('web'));
const calendar = guide.screens.find((s) => s.id === 'booking_calendar')!;
const addBooking = calendar.tasks.find((t) => t.id === 'add_booking')!;

for (const locale of LOCALES) {
  test(`${locale}: Menu → Help lists the guide screens, search narrows, rel=help metadata`, async ({ page }) => {
    await page.goto(`/${locale}/menu`);
    // Scope to <main>: the title bar's "Help for this screen" link also contains the word.
    const row = page.getByRole('main').getByRole('link', { name: new RegExp(`^${msg(locale, 'common.menu.help')}`) });
    await expect(row).toBeVisible();
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/menu/help$`));
    await expect(page.getByRole('heading', { level: 1, name: msg(locale, 'common.menu.help') })).toBeVisible();

    // Every web-platform screen has its section heading in this language.
    for (const screen of webScreens) {
      await expect(page.getByRole('heading', { level: 2, name: screen.title[locale] })).toBeVisible();
    }

    // Search narrows to the matching task and expands it (steps visible).
    const search = page.getByLabel(msg(locale, 'menu.help.search_placeholder'));
    await search.fill(addBooking.title[locale]);
    await expect(page.getByText(addBooking.title[locale]).first()).toBeVisible();
    // Fewer sections than the full guide (fuzzy fallback may keep look-alike
    // task titles such as "Add a new folder" — that is the typo tolerance).
    await expect.poll(async () => page.getByRole('heading', { level: 2 }).count()).toBeLessThan(webScreens.length);
    await expect(page.getByRole('heading', { level: 2, name: guide.screens.find((s) => s.id === 'reports')!.title[locale] })).toHaveCount(0);
    await expect(page.getByRole('link', { name: msg(locale, 'menu.help.show_me') }).first()).toBeVisible();

    // Public-guide metadata: index on the Help page itself.
    await expect(page.locator('link[rel="help"]')).toHaveAttribute('href', `${guide.site.baseUrl}${locale}/index.html`);
    await page.screenshot({ path: `test-results/help-${locale}.png`, scale: 'css' });
  });
}

test('Help for this screen: title-bar button opens Help at the current section; rel=help per screen', async ({ page }) => {
  await page.goto('/en/inventory/masterlist');
  await expect(page.locator('link[rel="help"]')).toHaveAttribute(
    'href',
    `${guide.site.baseUrl}en/inventory_masterlist.html`,
  );
  await page.getByRole('banner').getByRole('link', { name: msg('en', 'menu.help.for_this_screen') }).click();
  await expect(page).toHaveURL(/\/en\/menu\/help\?hl=inventory_masterlist$/);
  const section = page.locator('#hl-inventory_masterlist');
  await expect(section).toBeVisible();
  await expect(section).toBeInViewport();
  await expect(section.getByRole('heading', { level: 2, name: guide.screens.find((s) => s.id === 'inventory_masterlist')!.title.en })).toBeVisible();
});

test('guest: Show me on "Add a booking" navigates to the calendar and opens the booking form', async ({ page }) => {
  // Guest mode gives the booking screen a local business + owner permissions.
  await page.goto('/en/sign-in');
  await page.getByRole('button', { name: msg('en', 'onboarding.sign_in.continue_offline') }).click();
  await page.getByLabel(msg('en', 'onboarding.create.name_label')).fill('E2E Guest Hall');
  await page.getByLabel(msg('en', 'onboarding.create.owner_label')).fill('E2E Owner');
  await page.getByRole('button', { name: msg('en', 'onboarding.create.submit') }).click();
  await page.waitForURL(/\/en\/booking/);

  await page.goto('/en/menu/help');
  await page.getByLabel(msg('en', 'menu.help.search_placeholder')).fill(addBooking.title.en);
  const panel = page.locator('#help-booking_calendar-add_booking');
  await expect(panel).toBeVisible();
  await panel.getByRole('link', { name: msg('en', 'menu.help.show_me') }).click();

  // Lands on the calendar with the add form open; the ?action= is consumed.
  await expect(page).toHaveURL(/\/en\/booking/);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(msg('en', 'booking.calendar.add'), { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/en\/booking$/);
  await page.screenshot({ path: 'test-results/help-show-me-booking.png', scale: 'css' });
});
