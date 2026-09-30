/**
 * Supabase data access for the Files module (folders, files, folder_access —
 * shared migration 009). Same contract as every other section: client UUIDs,
 * tombstones via `deleted_at`, `updated_at` bumped by the server trigger,
 * every write through the offline-aware outbox layer (guest mode lands in
 * the Dexie store through the same calls). RLS scopes reads to the caller's
 * `files` permissions and restricted-folder access — clients never re-derive
 * access, they render what the server returned.
 *
 * `folder_access` has NO `id` column (composite PK folder_id + member_id):
 * writes use the outbox `match` locator with `entityId = "folderId|memberId"`
 * (D19) and are soft links — revoke sets `deleted_at`, re-grant clears it on
 * the same row; never a DELETE op.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { insertWithOutbox, updateWithOutbox } from '@/lib/outbox/mutate';
import { collectSubtree } from './tree';
import type { FileRecord, FilesIndex, FolderAccessRecord, FolderRecord } from './types';

const FOLDER_COLUMNS =
  'id, business_id, parent_id, name, restricted, created_by, updated_by, created_at, updated_at, deleted_at';
const FILE_COLUMNS =
  'id, business_id, folder_id, name, mime_type, size_bytes, drive_file_id, created_by, created_at, updated_at, deleted_at';
const ACCESS_COLUMNS = 'folder_id, member_id, business_id, created_at, updated_at, deleted_at';

export function normalizeFolder(row: Record<string, unknown>): FolderRecord {
  const f = row as unknown as FolderRecord;
  return {
    ...f,
    parent_id: f.parent_id ?? null,
    restricted: f.restricted === true,
    updated_by: f.updated_by ?? null,
    deleted_at: f.deleted_at ?? null,
  };
}

export function normalizeFile(row: Record<string, unknown>): FileRecord {
  const f = row as unknown as FileRecord;
  return {
    ...f,
    folder_id: f.folder_id ?? null,
    mime_type: f.mime_type || 'application/octet-stream',
    size_bytes: typeof f.size_bytes === 'number' ? f.size_bytes : Number(f.size_bytes ?? 0),
    deleted_at: f.deleted_at ?? null,
  };
}

/** Loads the LIVE index for a business (tombstones filtered server-side). */
export async function fetchFilesIndex(db: SupabaseClient, businessId: string): Promise<FilesIndex> {
  const [foldersRes, filesRes] = await Promise.all([
    db.from('folders').select(FOLDER_COLUMNS).eq('business_id', businessId).is('deleted_at', null),
    db.from('files').select(FILE_COLUMNS).eq('business_id', businessId).is('deleted_at', null),
  ]);
  const firstError = foldersRes.error ?? filesRes.error;
  if (firstError) {
    throw new Error(firstError.message);
  }
  return {
    folders: ((foldersRes.data ?? []) as Record<string, unknown>[]).map(normalizeFolder),
    files: ((filesRes.data ?? []) as Record<string, unknown>[]).map(normalizeFile),
  };
}

/** Creates a folder (client-side validation done by the caller). Returns the optimistic row. */
export async function createFolder(
  db: SupabaseClient,
  businessId: string,
  userId: string,
  parentId: string | null,
  name: string,
): Promise<FolderRecord> {
  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    business_id: businessId,
    parent_id: parentId,
    name: name.trim(),
    restricted: false,
    created_by: userId,
  };
  await insertWithOutbox(db, { module: 'files', table: 'folders', row, label: row.name });
  return normalizeFolder({ ...row, updated_by: null, created_at: now, updated_at: now, deleted_at: null });
}

export async function renameFolder(
  db: SupabaseClient,
  folder: FolderRecord,
  userId: string,
  name: string,
): Promise<FolderRecord> {
  const patch = { name: name.trim(), updated_by: userId, updated_at: new Date().toISOString() };
  await updateWithOutbox(db, {
    module: 'files',
    table: 'folders',
    entityId: folder.id,
    patch,
    baseUpdatedAt: folder.updated_at,
    label: patch.name,
  });
  return { ...folder, ...patch };
}

/**
 * Folder MOVE (owner feedback 2026-09-30; shared migration 010 relaxed the
 * parent_id guard): one UPDATE of `parent_id` through the outbox — the
 * subtree follows because children reference the folder by id. Caller has
 * already run `validateFolderMove` (cycle / depth / duplicate).
 */
export async function moveFolder(
  db: SupabaseClient,
  folder: FolderRecord,
  userId: string,
  parentId: string | null,
): Promise<FolderRecord> {
  const patch = { parent_id: parentId, updated_by: userId, updated_at: new Date().toISOString() };
  await updateWithOutbox(db, {
    module: 'files',
    table: 'folders',
    entityId: folder.id,
    patch,
    baseUpdatedAt: folder.updated_at,
    label: folder.name,
  });
  return { ...folder, ...patch };
}

/** File RENAME (owner feedback 2026-09-30): `name` was already mutable for whoever passes RLS. */
export async function renameFile(db: SupabaseClient, file: FileRecord, name: string): Promise<FileRecord> {
  const patch = { name: name.trim(), updated_at: new Date().toISOString() };
  await updateWithOutbox(db, {
    module: 'files',
    table: 'files',
    entityId: file.id,
    patch,
    baseUpdatedAt: file.updated_at,
    label: patch.name,
  });
  return { ...file, ...patch };
}

/** File MOVE (shared migration 010 relaxed the folder_id guard). */
export async function moveFile(db: SupabaseClient, file: FileRecord, folderId: string | null): Promise<FileRecord> {
  const patch = { folder_id: folderId, updated_at: new Date().toISOString() };
  await updateWithOutbox(db, {
    module: 'files',
    table: 'files',
    entityId: file.id,
    patch,
    baseUpdatedAt: file.updated_at,
    label: file.name,
  });
  return { ...file, ...patch };
}

/** Owner-only: flips `restricted` (the guard trigger rejects non-owners). */
export async function setFolderRestricted(
  db: SupabaseClient,
  folder: FolderRecord,
  userId: string,
  restricted: boolean,
): Promise<FolderRecord> {
  const patch = { restricted, updated_by: userId, updated_at: new Date().toISOString() };
  await updateWithOutbox(db, {
    module: 'files',
    table: 'folders',
    entityId: folder.id,
    patch,
    baseUpdatedAt: folder.updated_at,
    label: folder.name,
  });
  return { ...folder, ...patch };
}

/** Tombstones ONE file row (D10 — the caller best-effort deletes the Drive copy). */
export async function deleteFile(db: SupabaseClient, file: FileRecord): Promise<void> {
  const now = new Date().toISOString();
  await updateWithOutbox(db, {
    module: 'files',
    table: 'files',
    entityId: file.id,
    patch: { deleted_at: now, updated_at: now },
    baseUpdatedAt: file.updated_at,
    label: file.name,
  });
}

/**
 * Folder delete (D10): client-side recursive tombstone — every reachable
 * descendant file and folder first (one outbox op each, deepest last is not
 * required since there is no server cascade), then the folder itself.
 * Returns the tombstoned files so the caller can best-effort delete the
 * Drive copies it owns.
 */
export async function deleteFolderTree(
  db: SupabaseClient,
  folder: FolderRecord,
  userId: string,
  folders: Map<string, FolderRecord>,
  files: readonly FileRecord[],
): Promise<{ folders: FolderRecord[]; files: FileRecord[] }> {
  const now = new Date().toISOString();
  const sub = collectSubtree(folders, files, folder.id);
  for (const file of sub.files) {
    await updateWithOutbox(db, {
      module: 'files',
      table: 'files',
      entityId: file.id,
      patch: { deleted_at: now, updated_at: now },
      baseUpdatedAt: file.updated_at,
      label: file.name,
    });
  }
  // Children before parents (ADR-028 cascade style).
  for (const child of [...sub.folders].reverse()) {
    await updateWithOutbox(db, {
      module: 'files',
      table: 'folders',
      entityId: child.id,
      patch: { deleted_at: now, updated_by: userId, updated_at: now },
      baseUpdatedAt: child.updated_at,
      label: child.name,
    });
  }
  await updateWithOutbox(db, {
    module: 'files',
    table: 'folders',
    entityId: folder.id,
    patch: { deleted_at: now, updated_by: userId, updated_at: now },
    baseUpdatedAt: folder.updated_at,
    label: folder.name,
  });
  return { folders: [...sub.folders, folder], files: sub.files };
}

export interface FileRowInput {
  folderId: string | null;
  name: string;
  mimeType: string;
  sizeBytes: number;
  driveFileId: string;
}

/**
 * Inserts the metadata row AFTER the Drive upload succeeded (D19 — a server
 * row is always openable). Returns the optimistic row.
 */
export async function insertFileRow(
  db: SupabaseClient,
  businessId: string,
  userId: string,
  input: FileRowInput,
): Promise<FileRecord> {
  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    business_id: businessId,
    folder_id: input.folderId,
    name: input.name,
    mime_type: input.mimeType,
    size_bytes: input.sizeBytes,
    drive_file_id: input.driveFileId,
    created_by: userId,
  };
  await insertWithOutbox(db, { module: 'files', table: 'files', row, label: row.name });
  return normalizeFile({ ...row, created_at: now, updated_at: now, deleted_at: null });
}

/** Owner: every access row of the business (incl. tombstones — re-grant reuses the PK row). */
export async function fetchFolderAccess(db: SupabaseClient, businessId: string): Promise<FolderAccessRecord[]> {
  const { data, error } = await db.from('folder_access').select(ACCESS_COLUMNS).eq('business_id', businessId);
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    ...(row as unknown as FolderAccessRecord),
    deleted_at: (row.deleted_at as string | null | undefined) ?? null,
  }));
}

/**
 * Reconciles a folder's allow-list to `memberIds` (owner only): new pairs
 * insert, removed pairs tombstone, re-added pairs clear the tombstone on the
 * SAME composite-PK row. Returns the updated full access list.
 */
export async function saveFolderAccess(
  db: SupabaseClient,
  folder: FolderRecord,
  memberIds: readonly string[],
  allAccess: readonly FolderAccessRecord[],
): Promise<FolderAccessRecord[]> {
  const now = new Date().toISOString();
  const mine = allAccess.filter((a) => a.folder_id === folder.id);
  const byMember = new Map(mine.map((a) => [a.member_id, a]));
  const selected = new Set(memberIds);
  const next: FolderAccessRecord[] = allAccess.filter((a) => a.folder_id !== folder.id);
  const label = folder.name;

  for (const memberId of memberIds) {
    const existing = byMember.get(memberId);
    const entityId = `${folder.id}|${memberId}`;
    if (existing === undefined) {
      const row = { folder_id: folder.id, member_id: memberId, business_id: folder.business_id };
      await insertWithOutbox(db, { module: 'files', table: 'folder_access', row, entityId, label });
      next.push({ ...row, created_at: now, updated_at: now, deleted_at: null });
    } else if (existing.deleted_at !== null) {
      await updateWithOutbox(db, {
        module: 'files',
        table: 'folder_access',
        entityId,
        match: { folder_id: folder.id, member_id: memberId },
        patch: { deleted_at: null, updated_at: now },
        baseUpdatedAt: existing.updated_at,
        label,
      });
      next.push({ ...existing, deleted_at: null, updated_at: now });
    } else {
      next.push(existing);
    }
  }
  for (const row of mine) {
    if (!selected.has(row.member_id)) {
      if (row.deleted_at === null) {
        await updateWithOutbox(db, {
          module: 'files',
          table: 'folder_access',
          entityId: `${folder.id}|${row.member_id}`,
          match: { folder_id: folder.id, member_id: row.member_id },
          patch: { deleted_at: now, updated_at: now },
          baseUpdatedAt: row.updated_at,
          label,
        });
        next.push({ ...row, deleted_at: now, updated_at: now });
      } else {
        next.push(row);
      }
    }
  }
  return next;
}
