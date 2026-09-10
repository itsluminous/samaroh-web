/**
 * Notes data layer against the guest-mode Dexie local client (full guest
 * parity, migration 005 mirror): fetch + normalization, create, status
 * transitions with their timestamp anchors, tombstone purge + the 30-day
 * sweep, tag create and the soft note↔tag links on the composite
 * (note_id, tag_id) PK — link, unlink, relink-reuses-the-row and the
 * duplicate-insert rejection that keeps outbox replays idempotent.
 */
import 'fake-indexeddb/auto';
import { createLocalClient } from '@/lib/guest/localClient';
import { guestDb } from '@/lib/guest/localDb';
import {
  createNote,
  createTag,
  fetchNotesData,
  noteLabel,
  normalizeNote,
  purgeNote,
  setNoteStatus,
  setNoteTags,
  sweepExpiredTrash,
} from '@/app/[locale]/(app)/notes/_lib/queries';

const client = createLocalClient();
const BIZ = 'biz-1';
const USER = 'user-1';

beforeEach(async () => {
  await Promise.all(guestDb.tables.map((t) => t.clear()));
});

describe('notes queries (guest local client)', () => {
  it('createNote inserts through the data layer and fetchNotesData reads it back', async () => {
    const created = await createNote(client, BIZ, USER, {
      kind: 'checklist',
      title: 'Shopping',
      content: null,
      checklist: [{ id: 'i1', text: 'Garlands', done: false }],
      color: 'tomato',
      pinned: true,
    });
    expect(created.status).toBe('active');

    const { notes } = await fetchNotesData(client, BIZ);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.id).toBe(created.id);
    expect(notes[0]?.kind).toBe('checklist');
    expect(notes[0]?.checklist).toEqual([{ id: 'i1', text: 'Garlands', done: false }]);
    expect(notes[0]?.color).toBe('tomato');
    expect(notes[0]?.pinned).toBe(true);
  });

  it('fetchNotesData scopes to the business and hides tombstoned notes', async () => {
    await createNote(client, BIZ, USER, { kind: 'note', title: 'Mine', content: null, checklist: [], color: null, pinned: false });
    await createNote(client, 'biz-other', USER, { kind: 'note', title: 'Other', content: null, checklist: [], color: null, pinned: false });
    const gone = await createNote(client, BIZ, USER, { kind: 'note', title: 'Gone', content: null, checklist: [], color: null, pinned: false });
    await purgeNote(client, gone, USER);

    const { notes } = await fetchNotesData(client, BIZ);
    expect(notes.map((n) => n.title)).toEqual(['Mine']);
  });

  it('normalizeNote fills schema-lag gaps (missing checklist/pinned/status)', () => {
    const normalized = normalizeNote({ id: 'n1', business_id: BIZ, title: 'Bare' });
    expect(normalized.kind).toBe('note');
    expect(normalized.checklist).toEqual([]);
    expect(normalized.pinned).toBe(false);
    expect(normalized.status).toBe('active');
    expect(normalized.deleted_at).toBeNull();
  });

  it('noteLabel prefers the title, then a body/checklist snippet', () => {
    expect(noteLabel({ title: ' Plan ', content: null, checklist: [] })).toBe('Plan');
    expect(noteLabel({ title: null, content: 'Call caterer', checklist: [] })).toBe('Call caterer');
    expect(noteLabel({ title: null, content: null, checklist: [{ id: 'i', text: 'Diyas', done: false }] })).toBe('Diyas');
  });

  it('setNoteStatus sets and clears the completed_at / trashed_at anchors', async () => {
    const note = await createNote(client, BIZ, USER, { kind: 'note', title: 'N', content: null, checklist: [], color: null, pinned: false });

    const completed = await setNoteStatus(client, note, USER, 'completed');
    expect(completed.status).toBe('completed');
    expect(completed.completed_at).not.toBeNull();
    expect(completed.trashed_at).toBeNull();

    const trashed = await setNoteStatus(client, completed, USER, 'trashed');
    expect(trashed.trashed_at).not.toBeNull();
    expect(trashed.completed_at).toBeNull();

    const restored = await setNoteStatus(client, trashed, USER, 'active');
    expect(restored.completed_at).toBeNull();
    expect(restored.trashed_at).toBeNull();

    const { notes } = await fetchNotesData(client, BIZ);
    expect(notes[0]?.status).toBe('active');
  });

  it('sweepExpiredTrash tombstones only trash older than 30 days', async () => {
    const oldNote = await createNote(client, BIZ, USER, { kind: 'note', title: 'Old', content: null, checklist: [], color: null, pinned: false });
    const freshNote = await createNote(client, BIZ, USER, { kind: 'note', title: 'Fresh', content: null, checklist: [], color: null, pinned: false });
    await setNoteStatus(client, oldNote, USER, 'trashed');
    await setNoteStatus(client, freshNote, USER, 'trashed');
    // Backdate the old note's trashed_at past the retention window.
    await guestDb.notes.update(oldNote.id, { trashed_at: '2026-01-01T00:00:00Z' });

    const { notes: before } = await fetchNotesData(client, BIZ);
    const purged = await sweepExpiredTrash(client, before, USER, new Date('2026-09-10T00:00:00Z'));
    expect(purged.map((n) => n.title)).toEqual(['Old']);

    const { notes: after } = await fetchNotesData(client, BIZ);
    expect(after.map((n) => n.title)).toEqual(['Fresh']);
  });

  it('createTag + setNoteTags creates live composite-PK link rows', async () => {
    const note = await createNote(client, BIZ, USER, { kind: 'note', title: 'N', content: null, checklist: [], color: null, pinned: false });
    const tag = await createTag(client, BIZ, 'Vendors');

    const links = await setNoteTags(client, note, [tag.id], []);
    expect(links).toHaveLength(1);
    expect(links[0]?.deleted_at).toBeNull();

    const data = await fetchNotesData(client, BIZ);
    expect(data.tags.map((t) => t.name)).toEqual(['Vendors']);
    expect(data.links).toHaveLength(1);
    expect(data.links[0]?.note_id).toBe(note.id);
    expect(data.links[0]?.tag_id).toBe(tag.id);
  });

  it('untag tombstones the link and retag clears it on the SAME row (no second insert)', async () => {
    const note = await createNote(client, BIZ, USER, { kind: 'note', title: 'N', content: null, checklist: [], color: null, pinned: false });
    const tag = await createTag(client, BIZ, 'Vendors');

    let links = await setNoteTags(client, note, [tag.id], []);
    links = await setNoteTags(client, note, [], links);
    expect(links).toHaveLength(1);
    expect(links[0]?.deleted_at).not.toBeNull();
    // The Dexie store still holds exactly one composite-PK row.
    expect(await guestDb.note_tag_links.count()).toBe(1);

    links = await setNoteTags(client, note, [tag.id], links);
    expect(links).toHaveLength(1);
    expect(links[0]?.deleted_at).toBeNull();
    expect(await guestDb.note_tag_links.count()).toBe(1);
  });

  it('a duplicate composite-PK insert is rejected with 23505 (replay idempotency)', async () => {
    await client.from('note_tag_links').insert({ note_id: 'n1', tag_id: 't1', business_id: BIZ });
    const { error } = await client.from('note_tag_links').insert({ note_id: 'n1', tag_id: 't1', business_id: BIZ });
    expect(error?.code).toBe('23505');
    // A different pair under the same note is fine.
    const ok = await client.from('note_tag_links').insert({ note_id: 'n1', tag_id: 't2', business_id: BIZ });
    expect(ok.error).toBeNull();
  });
});
