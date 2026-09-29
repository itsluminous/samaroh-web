/**
 * Files module row shapes (shared migration 009). All three tables are
 * mutable rows with `updated_at` (LWW) + `deleted_at` tombstones; bytes live
 * in Google Drive (`files.drive_file_id`), these rows are the metadata index.
 */

export interface FolderRecord {
  id: string;
  business_id: string;
  /** NULL = top level ("All files"). */
  parent_id: string | null;
  name: string;
  /** Owner-only flag: true = only owner + folder_access members see the subtree. */
  restricted: boolean;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FileRecord {
  id: string;
  business_id: string;
  /** NULL = top level. */
  folder_id: string | null;
  /** Display name = original file name incl. extension (names may repeat). */
  name: string;
  mime_type: string;
  size_bytes: number;
  /** Drive file id in the uploader's Drive, anyone-with-link. NOT NULL server-side. */
  drive_file_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Allow-list row (composite PK folder_id + member_id, soft link). */
export interface FolderAccessRecord {
  folder_id: string;
  /** business_members.id */
  member_id: string;
  business_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** The live index the screen works from (RLS already filtered restricted subtrees). */
export interface FilesIndex {
  folders: FolderRecord[];
  files: FileRecord[];
}

export type FilesViewMode = 'list' | 'grid';
