/**
 * Checklist row reorder e2e — the pointer-events drag that replaced HTML5
 * drag-and-drop (which never fires on touch browsers). Hermetic: runs in
 * guest mode on the on-device Dexie store, no Supabase needed.
 *
 * Two input modes are verified for real:
 *   - mouse: press-and-move on the row picks up immediately and the DOM
 *     order changes on drop;
 *   - touch (mobile viewport + CDP Input.dispatchTouchEvent): a ~400ms
 *     long-press picks the row up and the drag reorders — exactly the case
 *     HTML5 dnd could not serve — while a quick swipe (no hold) never
 *     reorders, so scrolling stays intact.
 */
import { expect, test, type Page } from '@playwright/test';
import { authConfigured, msg } from './helpers';

// Hermetic-only: guest entry relies on the app running WITHOUT Supabase.
test.skip(authConfigured, 'guest-mode spec is hermetic-only');

const ITEMS = ['Alpha', 'Beta', 'Charlie'];

/** Guest setup → notes → create a checklist titled with 3 items; stays in the edit dialog. */
async function openChecklistEditor(page: Page): Promise<void> {
  await page.goto('/en/sign-in');
  await page.getByRole('button', { name: msg('en', 'onboarding.sign_in.continue_offline') }).click();
  await page.getByLabel(msg('en', 'onboarding.create.name_label')).fill('E2E Drag Hall');
  await page.getByLabel(msg('en', 'onboarding.create.owner_label')).fill('E2E Owner');
  await page.getByRole('button', { name: msg('en', 'onboarding.create.submit') }).click();
  await page.waitForURL(/\/en\/booking/);

  await page.goto('/en/notes');
  await page.getByRole('button', { name: msg('en', 'notes.home.create_checklist') }).click();
  await page.getByLabel(msg('en', 'notes.editor.title_placeholder')).fill('Puja list');
  const addField = page.getByLabel(msg('en', 'notes.editor.checklist_add'));
  for (const item of ITEMS) {
    await addField.fill(item);
    await addField.press('Enter');
    // Enter keeps focus in the field for the next item.
    await expect(addField).toBeFocused();
    await expect(addField).toHaveValue('');
  }
  await expect(page.locator('[data-checklist-row]')).toHaveText(ITEMS);
}

/** Saves the dialog, reopens the note from the grid, and re-enters edit mode. */
async function saveAndReopenEditor(page: Page): Promise<void> {
  await page.getByRole('button', { name: msg('en', 'common.action.save') }).click();
  await expect(page.locator('[data-checklist-row]')).toHaveCount(0);
  await page.getByText('Puja list').click();
  await page.getByRole('button', { name: msg('en', 'notes.action.edit') }).click();
}

test('mouse: press-and-move drags a row and the DOM order changes on drop', async ({ page }) => {
  await openChecklistEditor(page);
  const rows = page.locator('[data-checklist-row]');

  const alpha = await rows.nth(0).boundingBox();
  const charlie = await rows.nth(2).boundingBox();
  if (!alpha || !charlie) {
    throw new Error('checklist rows not visible');
  }
  const x = alpha.x + alpha.width / 2;
  const startY = alpha.y + alpha.height / 2;

  await page.mouse.move(x, startY);
  await page.mouse.down();
  // A few px of movement picks up immediately — no long-press for mouse.
  await page.mouse.move(x, startY + 6, { steps: 3 });
  await expect(rows.nth(0)).toHaveAttribute('data-dragging', 'true');
  // Past Charlie's midpoint: crosses both neighbors.
  await page.mouse.move(x, charlie.y + charlie.height / 2 + 4, { steps: 10 });
  await page.mouse.up();

  await expect(rows).toHaveText(['Beta', 'Charlie', 'Alpha']);

  // The order survives save + reopen (persisted through the data layer).
  await saveAndReopenEditor(page);
  await expect(page.locator('[data-checklist-row]')).toHaveText(['Beta', 'Charlie', 'Alpha']);
});

test.describe('touch (mobile viewport, CDP touch events)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('long-press picks up and the drag reorders; a quick swipe does not', async ({ page }) => {
    await openChecklistEditor(page);
    const rows = page.locator('[data-checklist-row]');
    const cdp = await page.context().newCDPSession(page);

    // --- Quick swipe (no hold): must NOT reorder — scrolling wins. ---
    let box = await rows.nth(0).boundingBox();
    if (!box) {
      throw new Error('checklist rows not visible');
    }
    let x = box.x + box.width / 2;
    let y = box.y + box.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 4; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: y + i * 20 }],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(rows).toHaveText(ITEMS);

    // --- Long-press (~400ms hold within the slop), then drag down. ---
    box = await rows.nth(0).boundingBox();
    if (!box) {
      throw new Error('checklist rows not visible');
    }
    x = box.x + box.width / 2;
    y = box.y + box.height / 2;
    const charlie = await rows.nth(2).boundingBox();
    if (!charlie) {
      throw new Error('checklist rows not visible');
    }
    const targetY = charlie.y + charlie.height / 2 + 4;

    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await page.waitForTimeout(550); // > LONG_PRESS_MS
    await expect(rows.nth(0)).toHaveAttribute('data-dragging', 'true'); // picked up by the hold
    const stepCount = 8;
    for (let i = 1; i <= stepCount; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: y + ((targetY - y) * i) / stepCount }],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    await expect(rows).toHaveText(['Beta', 'Charlie', 'Alpha']);

    // Persisted: survives save + reopen.
    await saveAndReopenEditor(page);
    await expect(page.locator('[data-checklist-row]')).toHaveText(['Beta', 'Charlie', 'Alpha']);
  });
});
