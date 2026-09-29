/**
 * Browser Drive client (design D9): configuration guard, token cache
 * semantics (non-interactive never opens a popup), Drive `q` escaping and
 * name sanitisation, find-or-create folder chain with the per-session memo,
 * anyone-with-link permission, and the swallow-everything best-effort delete.
 */
import {
  clearDriveToken,
  DRIVE_FILE_SCOPE,
  driveDeleteFileBestEffort,
  driveEnsureAnyoneReader,
  driveEnsureFolderPath,
  driveFindOrCreateFolder,
  getDriveAccessToken,
  getGoogleWebClientId,
  hasDriveToken,
  isDriveConfigured,
  resetDriveFolderMemo,
  sanitizeDriveName,
} from '@/lib/google/drive';

type FetchCall = { url: string; init: RequestInit | undefined };

function mockFetch(handler: (call: FetchCall) => { status: number; body?: unknown }) {
  const calls: FetchCall[] = [];
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init };
    calls.push(call);
    const { status, body } = handler(call);
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: String(status),
      json: async () => body ?? {},
    } as Response;
  }) as unknown as typeof fetch;
  return calls;
}

beforeEach(() => {
  clearDriveToken();
  resetDriveFolderMemo();
  delete process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  sessionStorage.clear();
});

describe('configuration + token cache', () => {
  it('is unconfigured without NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID (blank counts as unset)', () => {
    expect(isDriveConfigured()).toBe(false);
    process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID = '   ';
    expect(getGoogleWebClientId()).toBeNull();
    process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'abc.apps.googleusercontent.com';
    expect(isDriveConfigured()).toBe(true);
    expect(DRIVE_FILE_SCOPE).toBe('https://www.googleapis.com/auth/drive.file');
  });

  it('non-interactive token requests never open a popup and return null when nothing is cached', async () => {
    expect(hasDriveToken()).toBe(false);
    await expect(getDriveAccessToken({ interactive: false })).resolves.toBeNull();
  });

  it('interactive request without a client id fails with a DriveAuthError (not_configured)', async () => {
    await expect(getDriveAccessToken({ interactive: true })).rejects.toMatchObject({ name: 'DriveAuthError', message: 'not_configured' });
  });

  it('reads a still-valid token from sessionStorage (tab-scoped cache)', async () => {
    sessionStorage.setItem('samaroh_drive_token', JSON.stringify({ token: 'tok', expiresAt: Date.now() + 600_000 }));
    expect(hasDriveToken()).toBe(true);
    await expect(getDriveAccessToken({ interactive: false })).resolves.toBe('tok');
    clearDriveToken();
    expect(hasDriveToken()).toBe(false);
  });

  it('treats a token expiring within a minute as stale', () => {
    sessionStorage.setItem('samaroh_drive_token', JSON.stringify({ token: 'tok', expiresAt: Date.now() + 30_000 }));
    expect(hasDriveToken()).toBe(false);
  });
});

describe('folder chain', () => {
  it('sanitizes Drive names ("/" → "-", trimmed)', () => {
    expect(sanitizeDriveName(' a/b ')).toBe('a-b');
    expect(sanitizeDriveName('   ')).toBe('-');
  });

  it('find-or-create escapes quotes in q and creates only when missing', async () => {
    const calls = mockFetch(({ url, init }) => {
      if (init?.method === 'POST') {
        return { status: 200, body: { id: 'new-id' } };
      }
      return { status: 200, body: { files: url.includes('Existing') ? [{ id: 'found' }] : [] } };
    });
    await expect(driveFindOrCreateFolder('tok', 'Existing', 'root')).resolves.toBe('found');
    await expect(driveFindOrCreateFolder('tok', "Ram's Hall", 'parent')).resolves.toBe('new-id');
    const listCall = calls.find((c) => c.url.includes("Ram"))!;
    expect(decodeURIComponent(listCall.url)).toContain("name = 'Ram\\'s Hall'");
    expect(decodeURIComponent(listCall.url)).toContain("'parent' in parents");
    const create = calls.find((c) => c.init?.method === 'POST')!;
    expect(JSON.parse(create.init!.body as string)).toEqual({
      name: "Ram's Hall",
      mimeType: 'application/vnd.google-apps.folder',
      parents: ['parent'],
    });
    expect((create.init!.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('resolves Business/files/Folder below the root and memoizes per session', async () => {
    let created = 0;
    const calls = mockFetch(({ init }) => {
      if (init?.method === 'POST') {
        created += 1;
        return { status: 200, body: { id: `f${created}` } };
      }
      return { status: 200, body: { files: [] } };
    });
    await expect(driveEnsureFolderPath('tok', 'root-id', ['Hall', 'files', 'Docs'])).resolves.toBe('f3');
    expect(created).toBe(3);
    const before = calls.length;
    await expect(driveEnsureFolderPath('tok', 'root-id', ['Hall', 'files', 'Docs'])).resolves.toBe('f3');
    expect(calls.length).toBe(before); // memo hit — no network
    await expect(driveEnsureFolderPath('tok', 'root-id', ['Hall', 'files'])).resolves.toBe('f2');
  });
});

describe('permission + best-effort delete', () => {
  it('posts the anyone/reader permission', async () => {
    const calls = mockFetch(() => ({ status: 200, body: { id: 'p' } }));
    await driveEnsureAnyoneReader('tok', 'file-1');
    expect(calls[0]!.url).toContain('/files/file-1/permissions');
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ role: 'reader', type: 'anyone' });
  });

  it('swallows 403/404 (not my file / already gone) and reports whether Drive confirmed', async () => {
    mockFetch(() => ({ status: 403, body: { error: { message: 'forbidden' } } }));
    await expect(driveDeleteFileBestEffort('tok', 'x')).resolves.toBe(false);
    mockFetch(() => ({ status: 404 }));
    await expect(driveDeleteFileBestEffort('tok', 'x')).resolves.toBe(false);
    mockFetch(() => ({ status: 204 }));
    await expect(driveDeleteFileBestEffort('tok', 'x')).resolves.toBe(true);
  });

  it('a 401 drops the cached token so the next attempt re-links', async () => {
    sessionStorage.setItem('samaroh_drive_token', JSON.stringify({ token: 'tok', expiresAt: Date.now() + 600_000 }));
    mockFetch(() => ({ status: 401, body: { error: { message: 'expired' } } }));
    await expect(driveEnsureAnyoneReader('tok', 'f')).rejects.toMatchObject({ status: 401 });
    expect(hasDriveToken()).toBe(false);
  });
});
