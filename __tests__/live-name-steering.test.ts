/**
 * Live-name steering contract (samaroh-shared migration 008,
 * `uq_parties_biz_name` / `uq_master_items_biz_name` — plus the pre-existing
 * `uq_note_tags_biz_name` / `uq_event_types_biz_label`): server-side a name is
 * unique per business over LIVE rows only, and clients never resurrect a
 * tombstoned id — a deleted name is re-created as a brand-new row.
 *
 * For that to work, every duplicate-steering source the add/edit dialogs dedup
 * against (`fetchParties`, `fetchMasterItems`, `fetchNotesData().tags`,
 * `fetchEventTypes`) must hide tombstones; otherwise the dialog would flag a
 * dead twin as "already exists" and the re-create could never happen. Exercised
 * against the guest local client, which mirrors the PostgREST builder (`.is`
 * filters included).
 */
import 'fake-indexeddb/auto';
import { createLocalClient } from '@/lib/guest/localClient';
import { guestDb } from '@/lib/guest/localDb';
import { createParty, deleteParty, fetchParties } from '@/app/[locale]/(app)/expenses/_lib/queries';
import { createMasterItem, deleteMasterItem, fetchMasterItems } from '@/app/[locale]/(app)/inventory/_lib/queries';
import { createTag, deleteTag, fetchNotesData } from '@/app/[locale]/(app)/notes/_lib/queries';
import { createEventType, deleteEventType, fetchEventTypes, isDuplicateLabel } from '@/lib/booking/eventTypePresets';

const client = createLocalClient();
const BIZ = 'biz-1';

beforeEach(async () => {
  await Promise.all(guestDb.tables.map((t) => t.clear()));
});

describe('live-name steering sources hide tombstones (migration 008 contract)', () => {
  it('parties: a deleted name can be re-created with a new id; only the live row steers', async () => {
    const old = await createParty(client, BIZ, 'bhuneshwar singh', null, true);
    await deleteParty(client, old);
    expect(await fetchParties(client, BIZ)).toEqual([]); // nothing to steer to → dialog creates

    const fresh = await createParty(client, BIZ, 'bhuneshwar singh', null, true);
    expect(fresh.id).not.toBe(old.id);

    const live = await fetchParties(client, BIZ);
    expect(live.map((p) => p.id)).toEqual([fresh.id]);
    // The dialogs' exact-duplicate check (case-insensitive, like lower(name) server-side)
    // therefore sees exactly one live twin, never the tombstone.
    expect(live.filter((p) => p.name.toLocaleLowerCase() === 'Bhuneshwar Singh'.toLocaleLowerCase())).toHaveLength(1);
  });

  it('master items: a deleted name can be re-created with a new id; only the live row steers', async () => {
    const oldId = await createMasterItem(client, BIZ, 'Plastic Chair', 'pcs');
    await deleteMasterItem(client, oldId);
    expect(await fetchMasterItems(client, BIZ)).toEqual([]);

    const freshId = await createMasterItem(client, BIZ, 'plastic chair', 'pcs');
    expect(freshId).not.toBe(oldId);
    expect((await fetchMasterItems(client, BIZ)).map((i) => i.id)).toEqual([freshId]);
  });

  it('note tags: tombstoned tags are absent from the tag steering source', async () => {
    const old = await createTag(client, BIZ, 'Urgent');
    await deleteTag(client, old, []);
    expect((await fetchNotesData(client, BIZ)).tags).toEqual([]);

    const fresh = await createTag(client, BIZ, 'urgent');
    expect(fresh.id).not.toBe(old.id);
    expect((await fetchNotesData(client, BIZ)).tags.map((t) => t.id)).toEqual([fresh.id]);
  });

  it('event types: a deleted label is free again and only live presets count as duplicates', async () => {
    const old = await createEventType(client, BIZ, { label: 'Tilak', icon: '🪔', color: null, kind: 'marker' }, 0);
    await deleteEventType(client, old);
    const afterDelete = (await fetchEventTypes(client, BIZ)) ?? [];
    expect(afterDelete).toEqual([]);
    expect(isDuplicateLabel(afterDelete, 'Tilak')).toBe(false);

    const fresh = await createEventType(client, BIZ, { label: 'tilak', icon: '🪔', color: null, kind: 'marker' }, 0);
    const live = (await fetchEventTypes(client, BIZ)) ?? [];
    expect(live.map((p) => p.id)).toEqual([fresh.id]);
    expect(isDuplicateLabel(live, 'Tilak')).toBe(true);
    expect(isDuplicateLabel(live, 'Tilak', fresh.id)).toBe(false);
  });
});
