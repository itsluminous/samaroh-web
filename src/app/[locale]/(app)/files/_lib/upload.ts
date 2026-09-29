/**
 * Upload pipeline for the Files module (design §4, D8/D9/D13): pick →
 * size/batch checks BEFORE touching the network → per-file Drive upload into
 * the uploader's own Drive under `Samaroh/{Business}/files/{folder path}` →
 * anyone-with-link reader permission → metadata row (pushed only after the
 * upload succeeded, so a server row is always openable). Web uploads are
 * online-only; three uploads in flight at a time.
 *
 * The Drive side is injected (`FilesUploader`) so the routing/ordering is
 * unit-tested with a fake — `createDriveFilesUploader` is the production
 * wiring over `src/lib/google/drive.ts`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  driveEnsureAnyoneReader,
  driveEnsureFolderPath,
  driveUploadFile,
  getDriveAccessToken,
} from '@/lib/google/drive';
import { resolveDriveRootFolder } from '@/lib/google/googleAccount';
import { insertFileRow } from './queries';
import { MAX_FILE_BYTES, MAX_FILES_PER_BATCH, sanitizeFileName } from './tree';
import type { FileRecord, FolderRecord } from './types';

export const UPLOAD_CONCURRENCY = 3;
export const FALLBACK_MIME = 'application/octet-stream';

export interface UploadPlan {
  accepted: File[];
  /** Names of files over the 25 MiB cap (skipped, `files.upload.too_large`). */
  tooLarge: string[];
  /** True when more than MAX_FILES_PER_BATCH were picked — the batch is rejected as a whole. */
  tooMany: boolean;
}

/** Client-side gate (D13): batch size first, then the per-file byte cap. */
export function planUpload(picked: readonly File[]): UploadPlan {
  if (picked.length > MAX_FILES_PER_BATCH) {
    return { accepted: [], tooLarge: [], tooMany: true };
  }
  const accepted: File[] = [];
  const tooLarge: string[] = [];
  for (const file of picked) {
    if (file.size > MAX_FILE_BYTES) {
      tooLarge.push(file.name);
    } else {
      accepted.push(file);
    }
  }
  return { accepted, tooLarge, tooMany: false };
}

export interface UploadTarget {
  businessName: string;
  /** Folder chain root → target folder (names only; [] = top level). */
  folderChain: readonly Pick<FolderRecord, 'name'>[];
  folderId: string | null;
}

/** Drive path segments below the Samaroh root: `{Business}/files/{Folder}/{Sub}` (D4). */
export function drivePathSegments(target: UploadTarget): string[] {
  return [target.businessName, 'files', ...target.folderChain.map((f) => f.name)];
}

/** The Drive seam: upload one blob into the mirrored path; resolves to the Drive file id. */
export interface FilesUploader {
  upload(input: {
    file: File;
    name: string;
    mimeType: string;
    pathSegments: readonly string[];
    onProgress: (fraction: number) => void;
  }): Promise<string>;
}

export interface UploadBatchDeps {
  db: SupabaseClient;
  businessId: string;
  userId: string;
  uploader: FilesUploader;
  target: UploadTarget;
  /** Fires after each file completes (success or failure): done = completed count. */
  onProgress?: (done: number, total: number, fraction: number) => void;
}

export interface UploadBatchResult {
  uploaded: FileRecord[];
  /** File names whose upload failed (`files.upload.failed`). */
  failed: string[];
}

/**
 * Runs a batch with bounded concurrency. Each file: Drive upload → row insert.
 * A single failure never aborts the others. Rows are inserted ONLY after the
 * Drive id exists (contract: drive_file_id NOT NULL).
 */
export async function runUploadBatch(files: readonly File[], deps: UploadBatchDeps): Promise<UploadBatchResult> {
  const total = files.length;
  const uploaded: FileRecord[] = [];
  const failed: string[] = [];
  const fractions = new Array<number>(total).fill(0);
  let done = 0;
  const report = () => {
    const fraction = total === 0 ? 1 : fractions.reduce((a, b) => a + b, 0) / total;
    deps.onProgress?.(done, total, fraction);
  };
  const pathSegments = drivePathSegments(deps.target);

  let cursor = 0;
  const worker = async () => {
    while (cursor < total) {
      const index = cursor;
      cursor += 1;
      const file = files[index] as File;
      const name = sanitizeFileName(file.name);
      const mimeType = file.type && file.type.trim() !== '' ? file.type : FALLBACK_MIME;
      try {
        const driveFileId = await deps.uploader.upload({
          file,
          name,
          mimeType,
          pathSegments,
          onProgress: (fraction) => {
            fractions[index] = Math.max(0, Math.min(1, fraction));
            report();
          },
        });
        const row = await insertFileRow(deps.db, deps.businessId, deps.userId, {
          folderId: deps.target.folderId,
          name,
          mimeType,
          sizeBytes: file.size,
          driveFileId,
        });
        uploaded.push(row);
      } catch {
        failed.push(file.name);
      } finally {
        fractions[index] = 1;
        done += 1;
        report();
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, total) }, () => worker()));
  return { uploaded, failed };
}

/**
 * Production uploader over the GIS/Drive client: uses the cached token
 * (the caller obtained consent interactively before starting), resolves the
 * user's `Samaroh/` root (google_accounts cache), find-or-creates the folder
 * chain, uploads, then makes the file anyone-with-link readable (best-effort:
 * a permission failure does not fail the upload — Android's repair pass and
 * a later re-open still work through the Drive viewer for signed-in members).
 */
export function createDriveFilesUploader(db: SupabaseClient, userId: string): FilesUploader {
  return {
    async upload({ file, name, mimeType, pathSegments, onProgress }) {
      const token = await getDriveAccessToken({ interactive: false });
      if (!token) {
        throw new Error('drive_not_linked');
      }
      const rootId = await resolveDriveRootFolder(db, userId, token);
      const parentId = await driveEnsureFolderPath(token, rootId, pathSegments);
      const driveFileId = await driveUploadFile(token, { name, mimeType, parentId, blob: file, onProgress });
      try {
        await driveEnsureAnyoneReader(token, driveFileId);
      } catch {
        // best-effort (ADR-059 posture)
      }
      return driveFileId;
    },
  };
}
