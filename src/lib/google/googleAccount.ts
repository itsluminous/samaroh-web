/**
 * `google_accounts` row for the signed-in user (001 schema; RLS: own row
 * only). The web upserts it after a successful Drive consent so the
 * `Samaroh/` root folder id is cached and SHARED with Android (design D9):
 * whichever client created the root, the other reuses it instead of making
 * a second `Samaroh` folder. Tokens never leave the browser
 * (`refresh_token_cipher` stays null — the client-linked shape, ADR-003).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DRIVE_FILE_SCOPE,
  driveAccountEmail,
  driveFindOrCreateFolder,
  driveFolderExists,
} from './drive';

/** Name of the app root folder in the user's Drive (shared layout §9.1). */
export const DRIVE_ROOT_FOLDER_NAME = 'Samaroh';

interface GoogleAccountRow {
  user_id: string;
  email: string;
  scopes: string[];
  drive_root_folder_id: string | null;
}

/** Per-session memo so a batch of uploads resolves the root once. */
let rootMemo: { userId: string; folderId: string } | null = null;

export function resetGoogleAccountMemo(): void {
  rootMemo = null;
}

/**
 * Resolves (and caches) the user's `Samaroh/` root folder id: reuse the row's
 * cached id when it still exists in Drive, else find-or-create and upsert the
 * row (email from Drive's about.get, scopes ∪ drive.file). Supabase failures
 * on the upsert are non-fatal — the upload proceeds; the cache just isn't
 * shared until the next attempt.
 */
export async function resolveDriveRootFolder(
  db: SupabaseClient,
  userId: string,
  token: string,
): Promise<string> {
  if (rootMemo && rootMemo.userId === userId) {
    return rootMemo.folderId;
  }
  let existing: GoogleAccountRow | null = null;
  try {
    const { data } = await db
      .from('google_accounts')
      .select('user_id, email, scopes, drive_root_folder_id')
      .eq('user_id', userId)
      .maybeSingle();
    existing = (data as GoogleAccountRow | null) ?? null;
  } catch {
    existing = null;
  }

  let folderId: string | null = existing?.drive_root_folder_id ?? null;
  if (folderId && !(await driveFolderExists(token, folderId))) {
    folderId = null;
  }
  if (!folderId) {
    folderId = await driveFindOrCreateFolder(token, DRIVE_ROOT_FOLDER_NAME, null);
  }

  if (!existing || existing.drive_root_folder_id !== folderId || !existing.scopes.includes(DRIVE_FILE_SCOPE)) {
    let email = existing?.email ?? null;
    if (!email) {
      try {
        email = await driveAccountEmail(token);
      } catch {
        email = null;
      }
    }
    const scopes = Array.from(new Set([...(existing?.scopes ?? []), DRIVE_FILE_SCOPE]));
    try {
      await db.from('google_accounts').upsert(
        {
          user_id: userId,
          email: email ?? '',
          scopes,
          drive_root_folder_id: folderId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
    } catch {
      // Non-fatal: the cache is a convenience shared with Android.
    }
  }
  rootMemo = { userId, folderId };
  return folderId;
}
