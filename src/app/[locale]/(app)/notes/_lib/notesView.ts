/**
 * Pure view logic for the Notes section: drawer filtering (Notes / Completed
 * / Trash / per-tag), search across title + content + checklist items + tag
 * names, pinned-first ordering, checklist item edits and the 30-day trash
 * purge window. Kept free of React/Supabase so it unit-tests directly.
 */
import type { ChecklistItem, NoteRecord, NoteTagLinkRecord, NoteTagRecord } from './types';

/** Drawer selection: one of the three lists, or one tag scoped to active notes. */
export type NotesFilter =
  | { view: 'notes' | 'completed' | 'trash' }
  | { view: 'tag'; tagId: string };

/** Days a trashed note survives before the client purge sweep tombstones it. */
export const TRASH_RETENTION_DAYS = 30;

/** Live (non-tombstoned) tag ids of a note, from the full link list. */
export function liveTagIdsOf(noteId: string, links: NoteTagLinkRecord[]): string[] {
  return links.filter((l) => l.note_id === noteId && l.deleted_at === null).map((l) => l.tag_id);
}

/** Live tags of a note, in the business's tag-name order. */
export function tagsOf(
  note: NoteRecord,
  tags: NoteTagRecord[],
  links: NoteTagLinkRecord[],
): NoteTagRecord[] {
  const ids = new Set(liveTagIdsOf(note.id, links));
  return tags.filter((t) => ids.has(t.id));
}

/** Case-insensitive match over title, content, checklist item text and tag names. */
export function noteMatchesSearch(
  note: NoteRecord,
  query: string,
  noteTags: NoteTagRecord[],
): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') {
    return true;
  }
  if (note.title?.toLowerCase().includes(q)) {
    return true;
  }
  if (note.content?.toLowerCase().includes(q)) {
    return true;
  }
  if (note.checklist.some((item) => item.text.toLowerCase().includes(q))) {
    return true;
  }
  return noteTags.some((t) => t.name.toLowerCase().includes(q));
}

/**
 * Pinned-first, then most recently updated — the Keep-style grid order.
 * Trash/Completed have no pin section semantics, but pinned-first is harmless
 * and keeps the comparator single.
 */
export function compareNotes(a: NoteRecord, b: NoteRecord): number {
  if (a.pinned !== b.pinned) {
    return a.pinned ? -1 : 1;
  }
  return a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0;
}

/**
 * The notes the grid shows for a drawer selection + search query, ordered
 * pinned-first. Tag selections scope to ACTIVE notes carrying that tag
 * (Keep-style label views); search applies on top of the filter.
 */
export function visibleNotes(
  notes: NoteRecord[],
  tags: NoteTagRecord[],
  links: NoteTagLinkRecord[],
  filter: NotesFilter,
  query: string,
): NoteRecord[] {
  return notes
    .filter((n) => n.deleted_at === null)
    .filter((n) => {
      if (filter.view === 'tag') {
        return n.status === 'active' && liveTagIdsOf(n.id, links).includes(filter.tagId);
      }
      if (filter.view === 'completed') {
        return n.status === 'completed';
      }
      if (filter.view === 'trash') {
        return n.status === 'trashed';
      }
      return n.status === 'active';
    })
    .filter((n) => noteMatchesSearch(n, query, tagsOf(n, tags, links)))
    .sort(compareNotes);
}

/**
 * Row-major masonry distribution: item i goes into column i % columnCount,
 * so the first (newest / pinned-first) item lands top-left, the next
 * top-right, zig-zagging across each row before starting the next — the
 * reading order users expect. CSS `columns` masonry instead fills
 * column-major (down-then-across), which buries the newest notes at the
 * bottom of the first column; rendering these arrays as side-by-side flex
 * columns preserves the masonry look with the correct order.
 */
export function distributeToColumns<T>(items: T[], columnCount: number): T[][] {
  const count = Math.max(1, Math.floor(columnCount));
  const columns: T[][] = Array.from({ length: count }, () => []);
  items.forEach((item, i) => {
    // i % count is always a valid index into the freshly built array.
    columns[i % count]!.push(item);
  });
  return columns;
}

/** True when a trashed note has outlived the retention window. */
export function isPurgeDue(trashedAt: string | null, now: Date): boolean {
  if (trashedAt === null) {
    return false;
  }
  const cutoff = now.getTime() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return new Date(trashedAt).getTime() < cutoff;
}

/** The trashed notes the load-time purge sweep should tombstone. */
export function purgeDueNotes(notes: NoteRecord[], now: Date): NoteRecord[] {
  return notes.filter(
    (n) => n.deleted_at === null && n.status === 'trashed' && isPurgeDue(n.trashed_at, now),
  );
}

// --- checklist edits (immutable helpers) ---

/**
 * Drops blank checklist items (empty/whitespace text, or malformed rows
 * missing a string text). Blank items — typically saved by the mobile
 * editor's empty rows — otherwise render as phantom empty rows/cards on the
 * grid. Used on BOTH the read path (normalizeNote) and the save path.
 */
export function sanitizeChecklist(items: ChecklistItem[]): ChecklistItem[] {
  return items.filter((item) => typeof item.text === 'string' && item.text.trim() !== '');
}

/**
 * True when a note has no meaningful content: no title, no body and no
 * non-blank checklist item. The create flow discards such notes on close so
 * they never linger as empty cards in the grid.
 */
export function isNoteContentEmpty(input: {
  title: string | null;
  content: string | null;
  checklist: ChecklistItem[];
}): boolean {
  return (
    (input.title ?? '').trim() === '' &&
    (input.content ?? '').trim() === '' &&
    sanitizeChecklist(input.checklist).length === 0
  );
}

export function toggleChecklistItem(items: ChecklistItem[], itemId: string): ChecklistItem[] {
  return items.map((item) => (item.id === itemId ? { ...item, done: !item.done } : item));
}

export function addChecklistItem(items: ChecklistItem[], text: string): ChecklistItem[] {
  const trimmed = text.trim();
  if (trimmed === '') {
    return items;
  }
  return [...items, { id: crypto.randomUUID(), text: trimmed, done: false }];
}

export function removeChecklistItem(items: ChecklistItem[], itemId: string): ChecklistItem[] {
  return items.filter((item) => item.id !== itemId);
}

/**
 * Moves a checklist item to another position (drag reorder in the editor).
 * Out-of-range or same-position moves return the input untouched so drop
 * handlers can call this unconditionally.
 */
export function moveChecklistItem(items: ChecklistItem[], from: number, to: number): ChecklistItem[] {
  if (
    from === to ||
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/** Share/clipboard text: title line, then body or "[x]/[ ] item" lines. */
export function noteShareText(note: NoteRecord): string {
  const lines: string[] = [];
  if (note.title && note.title.trim() !== '') {
    lines.push(note.title.trim());
  }
  if (note.kind === 'checklist') {
    for (const item of note.checklist) {
      lines.push(`${item.done ? '[x]' : '[ ]'} ${item.text}`);
    }
  } else if (note.content && note.content.trim() !== '') {
    lines.push(note.content.trim());
  }
  return lines.join('\n');
}
