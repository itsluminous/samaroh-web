/**
 * Browser-side Google Drive client for the Files module (shared design D9).
 *
 * Auth: Google Identity Services token client with the `drive.file` scope
 * and the SAME Web-application OAuth client id Android uses
 * (`NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID`; the owner registers the site origins as
 * Authorized JavaScript origins). The access token lives in memory +
 * sessionStorage; on expiry the client re-requests it (a silent re-request
 * where Google allows it, otherwise the consent popup). The app must build
 * and run without the env var — `isDriveConfigured()` gates the upload UI
 * (`files.upload.not_configured`).
 *
 * REST: Drive v3 folder find-or-create (memoized per session), multipart
 * upload with XHR progress, anyone-with-link reader permission (ADR-059
 * posture — every member and the web can open the file), best-effort delete.
 * Every network call has a hard timeout (anti-stall).
 *
 * Nothing here imports Supabase: the `google_accounts` cache lives in
 * `googleAccount.ts`, the Files data layer wires the two together.
 */

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const TOKEN_STORAGE_KEY = 'samaroh_drive_token';

/** Anti-stall budgets (ms). */
export const DRIVE_TIMEOUTS = {
  script: 15_000,
  /** Consent popup — the user may take a while; GIS reports a closed popup itself. */
  consent: 120_000,
  metadata: 30_000,
  upload: 180_000,
} as const;

export function getGoogleWebClientId(): string | null {
  const id = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  return id && id.trim() !== '' ? id.trim() : null;
}

export function isDriveConfigured(): boolean {
  return getGoogleWebClientId() !== null;
}

/** Thrown when the user dismissed the consent popup or Google denied the request. */
export class DriveAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DriveAuthError';
  }
}

/** Thrown when a Drive REST call fails (status + Google's message). */
export class DriveApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'DriveApiError';
  }
}

// ---- GIS types (the subset we call; no @types/google.accounts dependency) ----

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}

interface GisOauth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type?: string; message?: string }) => void;
  }): TokenClient;
}

function gisOauth2(): GisOauth2 | null {
  const g = (globalThis as unknown as { google?: { accounts?: { oauth2?: GisOauth2 } } }).google;
  return g?.accounts?.oauth2 ?? null;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

let scriptPromise: Promise<void> | null = null;

/** Loads the GIS script once (idempotent, timeout-guarded). */
export function loadGisScript(): Promise<void> {
  if (gisOauth2()) {
    return Promise.resolve();
  }
  if (!scriptPromise) {
    scriptPromise = withTimeout(
      new Promise<void>((resolve, reject) => {
        if (typeof document === 'undefined') {
          reject(new Error('no document'));
          return;
        }
        const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT_SRC}"]`);
        const script = existing ?? document.createElement('script');
        script.addEventListener('load', () => resolve(), { once: true });
        script.addEventListener('error', () => reject(new Error('gis script failed')), { once: true });
        if (!existing) {
          script.src = GIS_SCRIPT_SRC;
          script.async = true;
          script.defer = true;
          document.head.appendChild(script);
        }
      }),
      DRIVE_TIMEOUTS.script,
      'GIS script',
    ).catch((error: unknown) => {
      scriptPromise = null; // allow a retry on the next attempt
      throw error;
    });
  }
  return scriptPromise;
}

interface StoredToken {
  token: string;
  /** Epoch ms; we refresh a minute early. */
  expiresAt: number;
}

let memoryToken: StoredToken | null = null;

function readStoredToken(): StoredToken | null {
  if (memoryToken) {
    return memoryToken;
  }
  try {
    const raw = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as StoredToken;
    if (typeof parsed.token === 'string' && typeof parsed.expiresAt === 'number') {
      memoryToken = parsed;
      return parsed;
    }
  } catch {
    // sessionStorage unavailable (private mode) — memory only.
  }
  return null;
}

function storeToken(token: StoredToken | null): void {
  memoryToken = token;
  try {
    if (token) {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
    } else {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

/** True when a still-valid access token is cached (the "linked" state for this tab). */
export function hasDriveToken(): boolean {
  const stored = readStoredToken();
  return stored !== null && stored.expiresAt - 60_000 > Date.now();
}

/** Forgets the cached token (sign-out / "unlink" in this tab). */
export function clearDriveToken(): void {
  storeToken(null);
}

/**
 * Returns a valid access token. `interactive=false` only returns a cached
 * token (never opens a popup); `interactive=true` runs the GIS token flow —
 * Google skips the consent screen when the user already granted the scope,
 * but the call MUST come from a user gesture (popup blockers).
 */
export async function getDriveAccessToken(options: { interactive: boolean }): Promise<string | null> {
  const cached = readStoredToken();
  if (cached && cached.expiresAt - 60_000 > Date.now()) {
    return cached.token;
  }
  if (!options.interactive) {
    return null;
  }
  const clientId = getGoogleWebClientId();
  if (!clientId) {
    throw new DriveAuthError('not_configured');
  }
  await loadGisScript();
  const oauth2 = gisOauth2();
  if (!oauth2) {
    throw new DriveAuthError('gis_unavailable');
  }
  const response = await withTimeout(
    new Promise<TokenResponse>((resolve, reject) => {
      const client = oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_FILE_SCOPE,
        callback: resolve,
        error_callback: (error) => reject(new DriveAuthError(error?.type ?? 'popup_failed')),
      });
      client.requestAccessToken({ prompt: '' });
    }),
    DRIVE_TIMEOUTS.consent,
    'Google consent',
  );
  if (!response.access_token) {
    throw new DriveAuthError(response.error ?? 'no_token');
  }
  const expiresIn = Number(response.expires_in ?? 3600);
  const stored = { token: response.access_token, expiresAt: Date.now() + expiresIn * 1000 };
  storeToken(stored);
  return stored.token;
}

// ---- REST ----

async function driveFetch<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DRIVE_TIMEOUTS.metadata);
  try {
    const response = await fetch(path.startsWith('http') ? path : `${DRIVE_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
    if (response.status === 401) {
      // Token revoked/expired server-side — drop the cache so the next
      // attempt re-requests (interactive callers surface the link prompt).
      storeToken(null);
    }
    if (!response.ok) {
      let message = response.statusText;
      try {
        const body = (await response.json()) as { error?: { message?: string } };
        message = body.error?.message ?? message;
      } catch {
        // non-JSON error body
      }
      throw new DriveApiError(response.status, message);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Escapes a value for a Drive `q` string literal. */
function q(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Drive folder names: '/' → '-' and trimmed (design §4 sanitisation). */
export function sanitizeDriveName(name: string): string {
  const cleaned = name.replace(/\//g, '-').trim();
  return cleaned === '' ? '-' : cleaned;
}

/** The signed-in Google account's email (drive.file allows about.get). */
export async function driveAccountEmail(token: string): Promise<string | null> {
  const about = await driveFetch<{ user?: { emailAddress?: string } }>(token, '/about?fields=user');
  return about.user?.emailAddress ?? null;
}

/** True when the folder id still exists and is not trashed. */
export async function driveFolderExists(token: string, folderId: string): Promise<boolean> {
  try {
    const meta = await driveFetch<{ id: string; trashed?: boolean }>(
      token,
      `/files/${encodeURIComponent(folderId)}?fields=id,trashed`,
    );
    return meta.trashed !== true;
  } catch (error) {
    if (error instanceof DriveApiError && error.status === 404) {
      return false;
    }
    throw error;
  }
}

/** Finds (live, same parent) or creates a folder; returns its id. */
export async function driveFindOrCreateFolder(
  token: string,
  name: string,
  parentId: string | null,
): Promise<string> {
  const parent = parentId ?? 'root';
  const query = `name = '${q(name)}' and mimeType = '${FOLDER_MIME}' and '${q(parent)}' in parents and trashed = false`;
  const found = await driveFetch<{ files?: { id: string }[] }>(
    token,
    `/files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1&spaces=drive`,
  );
  const existing = found.files?.[0]?.id;
  if (existing) {
    return existing;
  }
  const created = await driveFetch<{ id: string }>(token, '/files?fields=id', {
    method: 'POST',
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parent] }),
  });
  return created.id;
}

/** Per-session memo of resolved folder chains (`parentId/name` → id). */
const folderMemo = new Map<string, string>();

/** Resolves a folder path below `rootId`, find-or-create per segment (memoized). */
export async function driveEnsureFolderPath(
  token: string,
  rootId: string,
  segments: readonly string[],
): Promise<string> {
  let parent = rootId;
  for (const raw of segments) {
    const name = sanitizeDriveName(raw);
    const key = `${parent}/${name}`;
    let id = folderMemo.get(key);
    if (!id) {
      id = await driveFindOrCreateFolder(token, name, parent);
      folderMemo.set(key, id);
    }
    parent = id;
  }
  return parent;
}

/** Test/reset hook — forgets memoized folder ids. */
export function resetDriveFolderMemo(): void {
  folderMemo.clear();
}

export interface DriveUploadInput {
  name: string;
  mimeType: string;
  parentId: string;
  blob: Blob;
  /** 0..1 fraction of bytes sent. */
  onProgress?: (fraction: number) => void;
}

/**
 * Multipart upload (metadata + original bytes, never recompressed). XHR
 * instead of fetch for upload progress; hard timeout on the whole request.
 */
export function driveUploadFile(token: string, input: DriveUploadInput): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const form = new FormData();
    form.append(
      'metadata',
      new Blob([JSON.stringify({ name: input.name, mimeType: input.mimeType, parents: [input.parentId] })], {
        type: 'application/json',
      }),
    );
    form.append('file', input.blob, input.name);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', DRIVE_UPLOAD_API);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.timeout = DRIVE_TIMEOUTS.upload;
    xhr.responseType = 'json';
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        input.onProgress?.(Math.min(1, event.loaded / event.total));
      }
    };
    xhr.onerror = () => reject(new DriveApiError(0, 'network'));
    xhr.ontimeout = () => reject(new DriveApiError(0, 'timeout'));
    xhr.onload = () => {
      if (xhr.status === 401) {
        storeToken(null);
      }
      const body = (xhr.response ?? null) as { id?: string; error?: { message?: string } } | null;
      if (xhr.status >= 200 && xhr.status < 300 && body?.id) {
        resolve(body.id);
      } else {
        reject(new DriveApiError(xhr.status, body?.error?.message ?? xhr.statusText));
      }
    };
    xhr.send(form);
  });
}

/** Anyone-with-link reader permission (ADR-059) — idempotent on Drive's side. */
export async function driveEnsureAnyoneReader(token: string, fileId: string): Promise<void> {
  await driveFetch(token, `/files/${encodeURIComponent(fileId)}/permissions?fields=id`, {
    method: 'POST',
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });
}

/**
 * Best-effort delete (D10): 403 (not my file) and 404 (already gone) are
 * swallowed — the metadata tombstone is authoritative. Other failures are
 * ALSO swallowed by design (the caller has already tombstoned); returns
 * whether Drive confirmed the delete.
 */
export async function driveDeleteFileBestEffort(token: string, fileId: string): Promise<boolean> {
  try {
    await driveFetch(token, `/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
    return true;
  } catch {
    return false;
  }
}
