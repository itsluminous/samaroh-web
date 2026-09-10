// Domain types for the Notes section. Mirror the Supabase schema
// (shared/supabase/migrations/005_notes.sql). Checklists live as ONE jsonb
// blob per note ({id, text, done} array) — items are edited as a unit and
// LWW-merged per note, never as child rows.

export type NoteKind = 'note' | 'checklist';
export type NoteStatus = 'active' | 'completed' | 'trashed';

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface NoteRecord {
  id: string;
  business_id: string;
  kind: NoteKind;
  title: string | null;
  content: string | null;
  checklist: ChecklistItem[];
  /** Key from shared/booking-colors.json; null = default themed surface. */
  color: string | null;
  pinned: boolean;
  status: NoteStatus;
  completed_at: string | null;
  /** 30-day purge anchor — set when status flips to 'trashed'. */
  trashed_at: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface NoteTagRecord {
  id: string;
  business_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Soft link — untag sets deleted_at, retag clears it (the PK row is reused). */
export interface NoteTagLinkRecord {
  note_id: string;
  tag_id: string;
  business_id: string;
  updated_at: string;
  deleted_at: string | null;
}
