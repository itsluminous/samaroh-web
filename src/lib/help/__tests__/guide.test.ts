/**
 * Help guide data helpers (src/lib/help/guide.ts) against the REAL copied
 * guide (src/generated/help/*, from shared/help via `npm run gen:help`):
 *   1. deepLink resolution — every deepLink id in the guide is a routes.json
 *      id; every id a web-platform screen/task uses resolves to a web route;
 *      `{arg}` segments fall back to the parent list screen.
 *   2. filtering — android-only entries never show on the web; permission-
 *      gated screens/tasks are hidden (not greyed) for members lacking them
 *      and shown for owners; empty screens drop out.
 *   3. search — en + hi substring over titles/summaries/steps, fuzzy fallback.
 *   4. route → screen mapping covers every web route and the public URL /
 *      in-app route builders.
 */
import {
  HELP_GUIDE,
  HELP_ROUTES,
  SHOW_ME_ACTIONS,
  canSeeHelpEntry,
  filterGuideForWeb,
  helpRouteFor,
  helpSectionDomId,
  publicHelpUrl,
  resolveWebRoute,
  screenIdForPath,
  searchGuide,
  showMeHref,
  type HelpScreen,
} from '@/lib/help/guide';
import { emptyPermissions } from '@/lib/permissions/permissions';

const owner = { isOwner: true, permissions: emptyPermissions() };
const viewer = { isOwner: false, permissions: emptyPermissions() };

function onWeb(platforms?: string[]) {
  return !platforms || platforms.includes('web');
}

describe('deepLink resolution over the real guide', () => {
  it('the copied guide is schema version 1 with en + hi', () => {
    expect(HELP_GUIDE.version).toBe(1);
    expect(HELP_GUIDE.languages).toEqual(expect.arrayContaining(['en', 'hi']));
    expect(HELP_GUIDE.screens.length).toBeGreaterThan(0);
  });

  it('every screen and task deepLink is a routes.json id', () => {
    for (const screen of HELP_GUIDE.screens) {
      expect(HELP_ROUTES.routes).toHaveProperty(screen.deepLink);
      for (const task of screen.tasks) {
        expect(HELP_ROUTES.routes).toHaveProperty(task.deepLink);
      }
    }
  });

  it('every deepLink used by a web-platform screen/task resolves to a web route', () => {
    const unresolved: string[] = [];
    for (const screen of HELP_GUIDE.screens) {
      if (!onWeb(screen.platforms)) {
        continue;
      }
      if (resolveWebRoute(screen.deepLink) === null) {
        unresolved.push(`${screen.id} → ${screen.deepLink}`);
      }
      for (const task of screen.tasks) {
        if (!onWeb(task.platforms)) {
          continue;
        }
        if (resolveWebRoute(task.deepLink) === null) {
          unresolved.push(`${screen.id}/${task.id} → ${task.deepLink}`);
        }
      }
    }
    expect(unresolved).toEqual([]);
  });

  it('resolved routes are locale-unprefixed app paths with {args} dropped (parent list screen)', () => {
    for (const [id, route] of Object.entries(HELP_ROUTES.routes)) {
      const resolved = resolveWebRoute(id);
      if (route.web === null) {
        expect(resolved).toBeNull();
        continue;
      }
      expect(resolved).toMatch(/^\/[a-z][a-z0-9/-]*$/);
      expect(resolved).not.toContain('{');
    }
    expect(resolveWebRoute('expenses/ledger')).toBe('/expenses');
    expect(resolveWebRoute('inventory/item')).toBe('/inventory');
    expect(resolveWebRoute('reports/detail')).toBe('/menu/reports');
    expect(resolveWebRoute('menu/settings/reminders')).toBeNull(); // Android-only
    expect(resolveWebRoute('nope/unknown')).toBeNull();
  });

  it('Show me: sheet-style tasks get the dialog-opening ?action=, others the plain route', () => {
    const calendar = HELP_GUIDE.screens.find((s) => s.id === 'booking_calendar')!;
    const addBooking = calendar.tasks.find((t) => t.id === 'add_booking')!;
    expect(showMeHref(calendar.id, addBooking)).toBe('/booking?action=new_booking');
    const blockDates = calendar.tasks.find((t) => t.id === 'block_dates')!;
    expect(showMeHref(calendar.id, blockDates)).toBe('/booking?action=block_dates');
    const changeMonth = calendar.tasks.find((t) => t.id === 'change_month')!;
    expect(showMeHref(calendar.id, changeMonth)).toBe('/booking');

    const expenses = HELP_GUIDE.screens.find((s) => s.id === 'expenses_home')!;
    const addParty = expenses.tasks.find((t) => t.id === 'add_party')!;
    expect(showMeHref(expenses.id, addParty)).toBe('/expenses?action=add_party');

    const stock = HELP_GUIDE.screens.find((s) => s.id === 'inventory_stock')!;
    expect(showMeHref(stock.id, stock.tasks.find((t) => t.id === 'update_stock')!)).toBe('/inventory?action=update_stock');
    const master = HELP_GUIDE.screens.find((s) => s.id === 'inventory_masterlist')!;
    expect(showMeHref(master.id, master.tasks.find((t) => t.id === 'add_item')!)).toBe(
      '/inventory/masterlist?action=add_item',
    );

    // Every action key points at something that exists in the guide.
    for (const key of Object.keys(SHOW_ME_ACTIONS)) {
      const inRoutes = key in HELP_ROUTES.routes;
      const [screenId, taskId] = key.split('/');
      const inGuide = HELP_GUIDE.screens.some((s) => s.id === screenId && s.tasks.some((t) => t.id === taskId));
      expect(inRoutes || inGuide).toBe(true);
    }
    // An Android-only route yields no Show me target at all (button hidden).
    const settings = HELP_GUIDE.screens.find((s) => s.id === 'settings')!;
    const reminders = settings.tasks.find((t) => t.id === 'reminders')!;
    expect(showMeHref(settings.id, reminders)).toBeNull();
  });
});

describe('filterGuideForWeb', () => {
  it('owner sees every web-platform screen/task and no android-only ones; steps are web-filtered', () => {
    const screens = filterGuideForWeb(HELP_GUIDE.screens, owner);
    const expected = HELP_GUIDE.screens.filter((s) => onWeb(s.platforms) && s.tasks.some((t) => onWeb(t.platforms)));
    expect(screens.map((s) => s.id)).toEqual(expected.map((s) => s.id));
    for (const screen of screens) {
      for (const task of screen.tasks) {
        expect(onWeb(task.platforms)).toBe(true);
        expect(task.steps.length).toBeGreaterThan(0);
        for (const step of task.steps) {
          expect(onWeb(step.platforms)).toBe(true);
        }
      }
    }
    // An android-only task from the real guide is gone.
    const calendar = screens.find((s) => s.id === 'booking_calendar')!;
    expect(calendar.tasks.map((t) => t.id)).not.toContain('pending_reminders');
    expect(screens.find((s) => s.id === 'sign_in')!.tasks.map((t) => t.id)).toEqual(['sign_in']);
  });

  it('member without any capability: permission-gated screens and tasks are hidden, ungated ones remain', () => {
    const screens = filterGuideForWeb(HELP_GUIDE.screens, viewer);
    const ids = screens.map((s) => s.id);
    // Gated screens (booking.view, members → settings.manage_members, …) are gone …
    expect(ids).not.toContain('booking_calendar');
    expect(ids).not.toContain('members');
    expect(ids).not.toContain('reports');
    // … while ungated ones stay (app shell, menu, settings, sign in).
    expect(ids).toEqual(expect.arrayContaining(['app_shell', 'menu', 'settings', 'sign_in']));
    // Inside an ungated screen, a gated task disappears but ungated siblings stay.
    const settings = screens.find((s) => s.id === 'settings')!;
    expect(settings.tasks.map((t) => t.id)).not.toContain('event_types'); // settings.manage_business
    expect(settings.tasks.map((t) => t.id)).toContain('change_language');
    // Nothing gated survives anywhere.
    for (const screen of screens) {
      expect(screen.permission).toBeUndefined();
      for (const task of screen.tasks) {
        expect(task.permission).toBeUndefined();
      }
    }
  });

  it('a member with exactly booking.view sees the booking screens but only ungated booking tasks', () => {
    const permissions = emptyPermissions();
    permissions.booking.view = true;
    const screens = filterGuideForWeb(HELP_GUIDE.screens, { isOwner: false, permissions });
    const calendar = screens.find((s) => s.id === 'booking_calendar')!;
    expect(calendar).toBeDefined();
    const taskIds = calendar.tasks.map((t) => t.id);
    expect(taskIds).toContain('open_booking');
    expect(taskIds).not.toContain('add_booking'); // booking.create
    expect(taskIds).not.toContain('block_dates'); // booking.edit
    // booking_form requires booking.create → whole screen hidden.
    expect(screens.map((s) => s.id)).not.toContain('booking_form');
  });

  it('canSeeHelpEntry: unknown permission keys hide rather than fail open', () => {
    expect(canSeeHelpEntry(undefined, viewer)).toBe(true);
    expect(canSeeHelpEntry('booking.view', owner)).toBe(true);
    expect(canSeeHelpEntry('booking.view', viewer)).toBe(false);
    expect(canSeeHelpEntry('nonsense.cap', viewer)).toBe(false);
    expect(canSeeHelpEntry('booking', viewer)).toBe(false);
  });
});

describe('searchGuide', () => {
  const screens = filterGuideForWeb(HELP_GUIDE.screens, owner);

  it('empty query returns everything unchanged', () => {
    expect(searchGuide('', screens, 'en')).toEqual(screens);
    expect(searchGuide('   ', screens, 'hi')).toEqual(screens);
  });

  it('matches a task title in English and keeps only matching tasks of non-matching screens', () => {
    const card = HELP_GUIDE.screens.find((s) => s.id === 'booking_card')!;
    const title = card.tasks.find((t) => t.id === 'record_payment')!.title.en;
    const hits = searchGuide(title, screens, 'en');
    expect(hits.length).toBeGreaterThan(0);
    const cardHit = hits.find((s) => s.id === 'booking_card');
    expect(cardHit).toBeDefined();
    expect(cardHit!.tasks.map((t) => t.id)).toContain('record_payment');
    // A screen whose own title/summary did not match only keeps matching tasks.
    for (const screen of hits) {
      const original = screens.find((s) => s.id === screen.id)!;
      const screenMatched =
        original.title.en.toLowerCase().includes(title.toLowerCase()) ||
        original.summary.en.toLowerCase().includes(title.toLowerCase());
      if (!screenMatched) {
        expect(screen.tasks.length).toBeLessThanOrEqual(original.tasks.length);
      }
    }
  });

  it('matches Hindi step text when the UI language is hi', () => {
    const anyStep = screens[0]!.tasks[0]!.steps[0]!.hi;
    const word = anyStep.split(/\s+/).find((w) => w.length >= 4)!;
    const hits = searchGuide(word, screens, 'hi');
    expect(hits.length).toBeGreaterThan(0);
    // The English search for a Devanagari word finds nothing (language-scoped).
    expect(searchGuide(word, screens, 'en')).toEqual([]);
  });

  it('tolerates a typo in a task title via the fuzzy fallback and returns [] for gibberish', () => {
    const card = HELP_GUIDE.screens.find((s) => s.id === 'booking_card')!;
    const title = card.tasks.find((t) => t.id === 'record_payment')!.title.en; // e.g. "Record a payment"
    const typo = `${title.slice(0, 3)}x${title.slice(4)}`;
    const hits = searchGuide(typo, screens, 'en');
    expect(hits.some((s) => s.id === 'booking_card' && s.tasks.some((t) => t.id === 'record_payment'))).toBe(true);
    expect(searchGuide('zzqqxx99', screens, 'en')).toEqual([]);
  });
});

describe('route ↔ screen mapping and URL builders', () => {
  it('every web route in routes.json maps to a guide screen id (or the index for the Help page)', () => {
    const screenIds = new Set(HELP_GUIDE.screens.map((s) => s.id));
    for (const route of Object.values(HELP_ROUTES.routes)) {
      if (route.web === null) {
        continue;
      }
      // Fill {args} with a plausible value so the pattern matcher sees a real path.
      const path = route.web.replace(/\{[^}]+\}/g, 'abc123');
      const id = screenIdForPath(path);
      expect(id).not.toBeNull();
      expect(screenIds.has(id!)).toBe(true);
    }
    expect(screenIdForPath('/booking')).toBe('booking_calendar');
    expect(screenIdForPath('/expenses/p1')).toBe('expenses_ledger');
    expect(screenIdForPath('/inventory/masterlist')).toBe('inventory_masterlist');
    expect(screenIdForPath('/inventory/i1')).toBe('inventory_item');
    expect(screenIdForPath('/files/folder/sub')).toBe('files');
    expect(screenIdForPath('/menu/settings/language')).toBe('settings');
    expect(screenIdForPath('/menu/reports/revenue')).toBe('reports');
    expect(screenIdForPath('/menu/about')).toBe('menu');
    expect(screenIdForPath('/menu/help')).toBeNull();
    expect(screenIdForPath('/menu/help?hl=x')).toBeNull();
    expect(screenIdForPath('/unknown')).toBeNull();
  });

  it('public help URLs follow the guide site patterns per language', () => {
    const { baseUrl } = HELP_GUIDE.site;
    expect(publicHelpUrl('hi', 'booking_card')).toBe(`${baseUrl}hi/booking_card.html`);
    expect(publicHelpUrl('en', null)).toBe(`${baseUrl}en/index.html`);
    expect(baseUrl).toMatch(/^https:\/\/.+\/$/);
  });

  it('in-app help route + section ids use the shared ?hl= highlight convention', () => {
    expect(helpRouteFor('files')).toBe('/menu/help?hl=files');
    expect(helpRouteFor(null)).toBe('/menu/help');
    expect(helpSectionDomId('files')).toBe('hl-files');
  });

  it('the filtered guide keeps the original screen order', () => {
    const screens: HelpScreen[] = filterGuideForWeb(HELP_GUIDE.screens, owner);
    const order = HELP_GUIDE.screens.map((s) => s.id).filter((id) => screens.some((s) => s.id === id));
    expect(screens.map((s) => s.id)).toEqual(order);
  });
});
