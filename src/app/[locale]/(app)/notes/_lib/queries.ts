/**
 * Supabase data access for the Notes section (notes, note_tags,
 * note_tag_links — shared migration 005). All writes follow the app-wide
 * contract: client UUIDs, soft deletes via `deleted_at` tombstones,
 * `updated_at` bumped by the server trigger, everything through the
 * offline-aware outbox layer (guest mode lands in the Dexie store through
 * the same calls). RLS scopes every query to the caller's business
 * membership via the `notes` permission module.
 *
 * note_tag_links has NO `id` column (composite PK note_id+tag_id, matching
 * the server): writes address rows with the outbox layer's `match` locator,
 * and replay idempotency rides on the natural key's 23505.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { insertWithOutbox, updateWithOutbox } from '@/lib/outbox/mutate';
import { purgeDueNotes } from './notesView';
import type {
  ChecklistItem,
  NoteKind,
  NoteRecord,
  NoteStatus,
  NoteTagLinkRecord,
  NoteTagRecord,
} from './types';

const NOTE_COLUMNS =
  'id, business_id, kind, title, content, checklist, color, pinned, status, completed_at, trashed_at, created_by, updated_by, created_at, updated_at, deleted_at';

/** Sync-status label for a note: its title, else a body/checklist snippet. */
export function noteLabel(note: Pick<NoteRecord, 'title' | 'content' | 'checklist'>): string {
  const title = note.title?.trim();
  if (title) {
    return title;
  }
  const body = note.content?.trim() || note.checklist[0]?.text?.trim();
  return body ? body.slice(0, 40) : '…';
}

/** Fills schema-lag / guest-row gaps so every consumer sees the full shape. */
export function normalizeNote(row: Record<string, unknown>): NoteRecord {
  const n = row as unknown as NoteRecord;
  return {
    ...n,
    kind: n.kind === 'checklist' ? 'checklist' : 'note',
    title: n.title ?? null,
    content: n.content ?? null,
    checklist: Array.isArray(n.checklist) ? (n.checklist as ChecklistItem[]) : [],
    color: n.color ?? null,
    pinned: n.pinned === true,
    status: n.status === 'completed' || n.status === 'trashed' ? n.status : 'active',
    completed_at: n.completed_at ?? null,
    trashed_at: n.trashed_at ?? null,
    deleted_at: n.deleted_at ?? null,
  };
}

export interface NotesData {
  notes: NoteRecord[];
  tags: NoteTagRecord[];
  /** ALL link rows incl. tombstones — relink reuses the composite-PK row. */
  links: NoteTagLinkRecord[];
}

export async function fetchNotesData(db: SupabaseClient, businessId: string): Promise<NotesData> {
  const [notesRes, tagsRes, linksRes] = await Promise.all([
    db.from('notes').select(NOTE_COLUMNS).eq('business_id', businessId).is('deleted_at', null),
    db
      .from('note_tags')
      .select('id, business_id, name, created_at, updated_at, deleted_at')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .order('name', { ascending: true }),
    db
      .from('note_tag_links')
      .select('note_id, tag_id, business_id, updated_at, deleted_at')
      .eq('business_id', businessId),
  ]);
  const firstError = notesRes.error ?? tagsRes.error ?? linksRes.error;
  if (firstError) {
    throw new Error(firstError.message);
  }
  return {
    notes: ((notesRes.data ?? []) as Record<string, unknown>[]).map(normalizeNote),
    tags: (tagsRes.data ?? []) as NoteTagRecord[],
    links: (linksRes.data ?? []) as NoteTagLinkRecord[],
  };
}

export interface NoteInput {
  kind: NoteKind;
  title: string | null;
  content: string | null;
  checklist: ChecklistItem[];
  color: string | null;
  pinned: boolean;
}

/** Creates a note through the offline-aware data layer. Returns the optimistic row. */
export async function createNote(
  db: SupabaseClient,
  businessId: string,
  userId: string,
  input: NoteInput,
): Promise<NoteRecord> {
  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    business_id: businessId,
    kind: input.kind,
    title: input.title,
    content: input.content,
    checklist: input.checklist,
    color: input.color,
    pinned: input.pinned,
    status: 'active' as NoteStatus,
    created_by: userId,
  };
  await insertWithOutbox(db, { module: 'notes', table: 'notes', row, label: noteLabel(row) });
  return normalizeNote({ ...row, updated_by: null, completed_at: null, trashed_at: null, created_at: now, updated_at: now, deleted_at: null });
}

/** Content edit (title / body / checklist / color / pin) — one LWW patch per note. */
export async function updateNote(
  db: SupabaseClient,
  note: NoteRecord,
  userId: string,
  input: NoteInput,
): Promise<NoteRecord> {
  const patch = {
    title: input.title,
    content: input.content,
    checklist: input.checklist,
    color: input.color,
    pinned: input.pinned,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };
  await updateWithOutbox(db, {
    module: 'notes',
    table: 'notes',
    entityId: note.id,
    patch,
    baseUpdatedAt: note.updated_at,
    label: noteLabel({ ...note, ...input }),
  });
  return { ...note, ...patch };
}

export async function setNotePinned(
  db: SupabaseClient,
  note: NoteRecord,
  userId: string,
  pinned: boolean,
): Promise<NoteRecord> {
  const patch = { pinned, updated_by: userId, updated_at: new Date().toISOString() };
  await updateWithOutbox(db, {
    module: 'notes',
    table: 'notes',
    entityId: note.id,
    patch,
    baseUpdatedAt: note.updated_at,
    label: noteLabel(note),
  });
  return { ...note, ...patch };
}

/**
 * Status transition (complete / un-complete / trash / restore). Sets or
 * clears the matching timestamp anchors: completed_at on 'completed',
 * trashed_at on 'trashed' (the 30-day purge anchor), both null on 'active'.
 */
export async function setNoteStatus(
  db: SupabaseClient,
  note: NoteRecord,
  userId: string,
  status: NoteStatus,
): Promise<NoteRecord> {
  const now = new Date().toISOString();
  const patch = {
    status,
    completed_at: status === 'completed' ? now : null,
    trashed_at: status === 'trashed' ? now : null,
    updated_by: userId,
    updated_at: now,
  };
  await updateWithOutbox(db, {
    module: 'notes',
    table: 'notes',
    entityId: note.id,
    patch,
    baseUpdatedAt: note.updated_at,
    label: noteLabel(note),
  });
  return { ...note, ...patch };
}

/**
 * "Delete forever": tombstone the note (purge = tombstone per migration 005 —
 * sync engines never hard-delete synced rows). Client-side gate: notes.delete.
 */
export async function purgeNote(db: SupabaseClient, note: NoteRecord, userId: string): Promise<void> {
  const now = new Date().toISOString();
  await updateWithOutbox(db, {
    module: 'notes',
    table: 'notes',
    entityId: note.id,
    patch: { deleted_at: now, updated_by: userId, updated_at: now },
    baseUpdatedAt: note.updated_at,
    label: noteLabel(note),
  });
}

/**
 * Load-time purge sweep: tombstones every trashed note older than the 30-day
 * retention window. Caller gates on notes.delete (the "delete forever"
 * permission). Returns the purged notes so the UI can drop them from state.
 */
export async function sweepExpiredTrash(
  db: SupabaseClient,
  notes: NoteRecord[],
  userId: string,
  now: Date = new Date(),
): Promise<NoteRecord[]> {
  const due = purgeDueNotes(notes, now);
  for (const note of due) {
    await purgeNote(db, note, userId);
  }
  return due;
}

/** Creates a tag (create-on-the-fly from the type-ahead). Returns the optimistic row. */
export async function createTag(
  db: SupabaseClient,
  businessId: string,
  name: string,
): Promise<NoteTagRecord> {
  const now = new Date().toISOString();
  const row = { id: crypto.randomUUID(), business_id: businessId, name: name.trim() };
  await insertWithOutbox(db, { module: 'notes', table: 'note_tags', row, label: row.name });
  return { ...row, created_at: now, updated_at: now, deleted_at: null };
}

/**
 * Reconciles a note's tag set to `selectedTagIds`. Soft links: a new pair
 * inserts, an untag tombstones the link, a retag clears the tombstone on the
 * SAME composite-PK row (never a second insert — the PK would reject it).
 */
export async function setNoteTags(
  db: SupabaseClient,
  note: NoteRecord,
  selectedTagIds: string[],
  allLinks: NoteTagLinkRecord[],
): Promise<NoteTagLinkRecord[]> {
  const now = new Date().toISOString();
  const mine = allLinks.filter((l) => l.note_id === note.id);
  const byTag = new Map(mine.map((l) => [l.tag_id, l]));
  const selected = new Set(selectedTagIds);
  const next: NoteTagLinkRecord[] = allLinks.filter((l) => l.note_id !== note.id);

  for (const tagId of selectedTagIds) {
    const existing = byTag.get(tagId);
    if (existing === undefined) {
      const row = { note_id: note.id, tag_id: tagId, business_id: note.business_id };
      await insertWithOutbox(db, {
        module: 'notes',
        table: 'note_tag_links',
        row,
        entityId: `${note.id}:${tagId}`,
        label: noteLabel(note),
      });
      next.push({ ...row, updated_at: now, deleted_at: null });
    } else if (existing.deleted_at !== null) {
      await updateWithOutbox(db, {
        module: 'notes',
        table: 'note_tag_links',
        entityId: `${note.id}:${tagId}`,
        match: { note_id: note.id, tag_id: tagId },
        patch: { deleted_at: null, updated_at: now },
        baseUpdatedAt: existing.updated_at,
        label: noteLabel(note),
      });
      next.push({ ...existing, deleted_at: null, updated_at: now });
    } else {
      next.push(existing);
    }
  }

  for (const link of mine) {
    if (!selected.has(link.tag_id)) {
      if (link.deleted_at === null) {
        await updateWithOutbox(db, {
          module: 'notes',
          table: 'note_tag_links',
          entityId: `${note.id}:${link.tag_id}`,
          match: { note_id: note.id, tag_id: link.tag_id },
          patch: { deleted_at: now, updated_at: now },
          baseUpdatedAt: link.updated_at,
          label: noteLabel(note),
        });
        next.push({ ...link, deleted_at: now, updated_at: now });
      } else {
        next.push(link);
      }
    }
  }
  return next;
}
