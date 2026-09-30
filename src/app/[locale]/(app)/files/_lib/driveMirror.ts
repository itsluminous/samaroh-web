/**
 * Best-effort Google Drive mirror of RENAME / MOVE (owner feedback
 * 2026-09-30). The Supabase metadata row is authoritative; Drive is the
 * human-readable mirror under `Samaroh/{Business}/files/{Folder}/{Sub}` (D4),
 * and only the copies THIS browser's linked account owns can be touched
 * (`drive.file` scope). Every helper therefore:
 *   - does nothing when no Drive token is cached (never opens the consent
 *     popup — `interactive: false`), or when the client id is not configured;
 *   - swallows every failure (403 not my file, 404 gone, network, timeout —
 *     the Drive client's per-call timeouts bound the wait);
 *   - resolves mirror FOLDERS by path (find only for the source — a mirror
 *     that was never created has nothing to rename/move; find-or-create for a
 *     move destination so the file lands where a fresh upload would).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  driveEnsureFolderPath,
  driveFindFolderPath,
  driveMoveBestEffort,
  driveRenameBestEffort,
  getDriveAccessToken,
  hasDriveToken,
  isDriveConfigured,
} from '@/lib/google/drive';
import { resolveDriveRootFolder } from '@/lib/google/googleAccount';
import type { FolderRecord } from './types';

/** Drive path segments below the Samaroh root for a folder chain (names root → folder). */
export function mirrorSegments(businessName: string, chain: readonly Pick<FolderRecord, 'name'>[]): string[] {
  return [businessName, 'files', ...chain.map((f) => f.name)];
}

async function tokenOrNull(): Promise<string | null> {
  if (!isDriveConfigured() || !hasDriveToken()) {
    return null;
  }
  return getDriveAccessToken({ interactive: false }).catch(() => null);
}

/** Renames the Drive copy of a file. */
export async function mirrorFileRename(driveFileId: string, name: string): Promise<boolean> {
  const token = await tokenOrNull();
  if (!token) {
    return false;
  }
  try {
    return await driveRenameBestEffort(token, driveFileId, name);
  } catch {
    return false;
  }
}

/** Renames the mirror folder found at `oldChain` (names root → the folder being renamed). */
export async function mirrorFolderRename(
  db: SupabaseClient,
  userId: string,
  businessName: string,
  oldChain: readonly Pick<FolderRecord, 'name'>[],
  newName: string,
): Promise<boolean> {
  const token = await tokenOrNull();
  if (!token) {
    return false;
  }
  try {
    const rootId = await resolveDriveRootFolder(db, userId, token);
    const folderId = await driveFindFolderPath(token, rootId, mirrorSegments(businessName, oldChain));
    if (!folderId) {
      return false;
    }
    return driveRenameBestEffort(token, folderId, newName);
  } catch {
    return false;
  }
}

/** Re-parents the Drive copy of a file under the mirror of `destinationChain`. */
export async function mirrorFileMove(
  db: SupabaseClient,
  userId: string,
  businessName: string,
  driveFileId: string,
  destinationChain: readonly Pick<FolderRecord, 'name'>[],
): Promise<boolean> {
  const token = await tokenOrNull();
  if (!token) {
    return false;
  }
  try {
    const rootId = await resolveDriveRootFolder(db, userId, token);
    const parentId = await driveEnsureFolderPath(token, rootId, mirrorSegments(businessName, destinationChain));
    return driveMoveBestEffort(token, driveFileId, parentId);
  } catch {
    return false;
  }
}

/** Re-parents the mirror folder found at `oldChain` under the mirror of `destinationChain`. */
export async function mirrorFolderMove(
  db: SupabaseClient,
  userId: string,
  businessName: string,
  oldChain: readonly Pick<FolderRecord, 'name'>[],
  destinationChain: readonly Pick<FolderRecord, 'name'>[],
): Promise<boolean> {
  const token = await tokenOrNull();
  if (!token) {
    return false;
  }
  try {
    const rootId = await resolveDriveRootFolder(db, userId, token);
    const folderId = await driveFindFolderPath(token, rootId, mirrorSegments(businessName, oldChain));
    if (!folderId) {
      return false;
    }
    const parentId = await driveEnsureFolderPath(token, rootId, mirrorSegments(businessName, destinationChain));
    return driveMoveBestEffort(token, folderId, parentId);
  } catch {
    return false;
  }
}
