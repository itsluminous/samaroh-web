/**
 * Notes view logic: drawer filtering (Notes/Completed/Trash/tag), search over
 * title + content + checklist items + tag names, pinned-first ordering, the
 * 30-day purge window and the immutable checklist edit helpers.
 */
import {
  addChecklistItem,
  compareNotes,
  isPurgeDue,
  noteMatchesSearch,
  noteShareText,
  purgeDueNotes,
  removeChecklistItem,
  tagsOf,
  toggleChecklistItem,
  visibleNotes,
} from '../notesView';
import type { NoteRecord, NoteTagLinkRecord, NoteTagRecord } from '../types';

let seq = 0;

function makeNote(overrides: Partial<NoteRecord> = {}): NoteRecord {
  seq += 1;
  return {
    id: `note-${seq}`,
    business_id: 'biz-1',
    kind: 'note',
    title: null,
    content: null,
    checklist: [],
    color: null,
    pinned: false,
    status: 'active',
    completed_at: null,
    trashed_at: null,
    created_by: 'user-1',
    updated_by: null,
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
    deleted_at: null,
    ...overrides,
  };
}

function makeTag(id: string, name: string): NoteTagRecord {
  return {
    id,
    business_id: 'biz-1',
    name,
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
    deleted_at: null,
  };
}

function makeLink(noteId: string, tagId: string, deletedAt: string | null = null): NoteTagLinkRecord {
  return {
    note_id: noteId,
    tag_id: tagId,
    business_id: 'biz-1',
    updated_at: '2026-09-01T10:00:00Z',
    deleted_at: deletedAt,
  };
}

describe('noteMatchesSearch', () => {
  const tags = [makeTag('t1', 'Vendors')];

  it('matches title, content and checklist item text case-insensitively', () => {
    expect(noteMatchesSearch(makeNote({ title: 'Shaadi plan' }), 'shaadi', [])).toBe(true);
    expect(noteMatchesSearch(makeNote({ content: 'Call the caterer' }), 'CATERER', [])).toBe(true);
    expect(
      noteMatchesSearch(
        makeNote({ kind: 'checklist', checklist: [{ id: 'i1', text: 'Buy garlands', done: false }] }),
        'garland',
        [],
      ),
    ).toBe(true);
    expect(noteMatchesSearch(makeNote({ title: 'Shaadi plan' }), 'catering', [])).toBe(false);
  });

  it('matches the note’s tag names', () => {
    expect(noteMatchesSearch(makeNote(), 'vend', tags)).toBe(true);
    expect(noteMatchesSearch(makeNote(), 'flowers', tags)).toBe(false);
  });

  it('empty and whitespace-only queries match everything', () => {
    expect(noteMatchesSearch(makeNote(), '', [])).toBe(true);
    expect(noteMatchesSearch(makeNote(), '   ', [])).toBe(true);
  });
});

describe('visibleNotes', () => {
  const active = makeNote({ id: 'n-active', title: 'Active', updated_at: '2026-09-02T10:00:00Z' });
  const pinned = makeNote({ id: 'n-pinned', title: 'Pinned', pinned: true, updated_at: '2026-09-01T10:00:00Z' });
  const completed = makeNote({ id: 'n-done', title: 'Done', status: 'completed' });
  const trashed = makeNote({ id: 'n-trash', title: 'Binned', status: 'trashed', trashed_at: '2026-09-01T10:00:00Z' });
  const tombstoned = makeNote({ id: 'n-gone', title: 'Gone', deleted_at: '2026-09-01T10:00:00Z' });
  const all = [active, pinned, completed, trashed, tombstoned];
  const tags = [makeTag('t1', 'Vendors')];
  const links = [makeLink('n-active', 't1')];

  it('the Notes view shows only active notes, pinned first', () => {
    const result = visibleNotes(all, tags, links, { view: 'notes' }, '');
    expect(result.map((n) => n.id)).toEqual(['n-pinned', 'n-active']);
  });

  it('Completed and Trash views show only their status', () => {
    expect(visibleNotes(all, tags, links, { view: 'completed' }, '').map((n) => n.id)).toEqual(['n-done']);
    expect(visibleNotes(all, tags, links, { view: 'trash' }, '').map((n) => n.id)).toEqual(['n-trash']);
  });

  it('tombstoned notes never appear anywhere', () => {
    for (const view of ['notes', 'completed', 'trash'] as const) {
      expect(visibleNotes(all, tags, links, { view }, '').some((n) => n.id === 'n-gone')).toBe(false);
    }
  });

  it('a tag selection scopes to ACTIVE notes with a LIVE link to that tag', () => {
    const untagged = visibleNotes(all, tags, [makeLink('n-active', 't1', '2026-09-02T00:00:00Z')], { view: 'tag', tagId: 't1' }, '');
    expect(untagged).toHaveLength(0);
    const tagged = visibleNotes(all, tags, links, { view: 'tag', tagId: 't1' }, '');
    expect(tagged.map((n) => n.id)).toEqual(['n-active']);
  });

  it('search composes with the drawer filter', () => {
    expect(visibleNotes(all, tags, links, { view: 'notes' }, 'pinned').map((n) => n.id)).toEqual(['n-pinned']);
    expect(visibleNotes(all, tags, links, { view: 'notes' }, 'binned')).toHaveLength(0);
  });

  it('unpinned notes order by most recent update', () => {
    const older = makeNote({ id: 'n-old', updated_at: '2026-08-01T10:00:00Z' });
    const newer = makeNote({ id: 'n-new', updated_at: '2026-09-05T10:00:00Z' });
    expect(compareNotes(newer, older)).toBeLessThan(0);
    const result = visibleNotes([older, newer], [], [], { view: 'notes' }, '');
    expect(result.map((n) => n.id)).toEqual(['n-new', 'n-old']);
  });
});

describe('tagsOf', () => {
  it('resolves only live links to tag records', () => {
    const tags = [makeTag('t1', 'Vendors'), makeTag('t2', 'Ideas')];
    const links = [makeLink('n1', 't1'), makeLink('n1', 't2', '2026-09-02T00:00:00Z')];
    const note = makeNote({ id: 'n1' });
    expect(tagsOf(note, tags, links).map((t) => t.name)).toEqual(['Vendors']);
  });
});

describe('trash purge window', () => {
  const now = new Date('2026-09-10T12:00:00Z');

  it('isPurgeDue flips strictly after 30 days', () => {
    expect(isPurgeDue('2026-08-10T11:00:00Z', now)).toBe(true); // 31 days
    expect(isPurgeDue('2026-08-12T12:00:00Z', now)).toBe(false); // 29 days
    expect(isPurgeDue(null, now)).toBe(false);
  });

  it('purgeDueNotes picks only expired, still-live trashed notes', () => {
    const expired = makeNote({ id: 'n-exp', status: 'trashed', trashed_at: '2026-08-01T00:00:00Z' });
    const fresh = makeNote({ id: 'n-fresh', status: 'trashed', trashed_at: '2026-09-09T00:00:00Z' });
    const alreadyGone = makeNote({
      id: 'n-gone',
      status: 'trashed',
      trashed_at: '2026-08-01T00:00:00Z',
      deleted_at: '2026-09-01T00:00:00Z',
    });
    const activeOld = makeNote({ id: 'n-act', status: 'active', trashed_at: '2026-08-01T00:00:00Z' });
    expect(purgeDueNotes([expired, fresh, alreadyGone, activeOld], now).map((n) => n.id)).toEqual(['n-exp']);
  });
});

describe('checklist helpers', () => {
  const items = [
    { id: 'i1', text: 'One', done: false },
    { id: 'i2', text: 'Two', done: true },
  ];

  it('toggleChecklistItem flips only the addressed item, immutably', () => {
    const next = toggleChecklistItem(items, 'i1');
    expect(next[0]?.done).toBe(true);
    expect(next[1]?.done).toBe(true);
    expect(items[0]?.done).toBe(false); // original untouched
  });

  it('addChecklistItem trims and ignores empty text', () => {
    expect(addChecklistItem(items, '  Three  ').map((i) => i.text)).toEqual(['One', 'Two', 'Three']);
    expect(addChecklistItem(items, '   ')).toHaveLength(2);
  });

  it('removeChecklistItem drops the addressed item', () => {
    expect(removeChecklistItem(items, 'i2').map((i) => i.id)).toEqual(['i1']);
  });
});

describe('noteShareText', () => {
  it('joins title and body for plain notes', () => {
    expect(noteShareText(makeNote({ title: 'Plan', content: 'Call caterer' }))).toBe('Plan\nCall caterer');
    expect(noteShareText(makeNote({ content: 'Body only' }))).toBe('Body only');
  });

  it('renders checklists as [x]/[ ] lines', () => {
    const note = makeNote({
      kind: 'checklist',
      title: 'Shopping',
      checklist: [
        { id: 'i1', text: 'Garlands', done: true },
        { id: 'i2', text: 'Diyas', done: false },
      ],
    });
    expect(noteShareText(note)).toBe('Shopping\n[x] Garlands\n[ ] Diyas');
  });
});
