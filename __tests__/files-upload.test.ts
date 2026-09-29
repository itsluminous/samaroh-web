/**
 * Upload pipeline routing (design §4, D13, D19): batch/size gates reject
 * BEFORE any network call; per-file Drive upload → row insert (never a row
 * without a Drive id); failures isolated; bounded concurrency; Drive path
 * mirrors `{Business}/files/{Folder}/{Sub}`. The Drive side is a fake.
 */
import 'fake-indexeddb/auto';
import { createLocalClient } from '@/lib/guest/localClient';
import { guestDb } from '@/lib/guest/localDb';
import {
  drivePathSegments,
  FALLBACK_MIME,
  planUpload,
  runUploadBatch,
  UPLOAD_CONCURRENCY,
  type FilesUploader,
} from '@/app/[locale]/(app)/files/_lib/upload';
import { MAX_FILE_BYTES } from '@/app/[locale]/(app)/files/_lib/tree';

// The guest local client is a real PostgREST-subset store — the row insert
// lands in Dexie so the test can assert what was persisted.
const db = createLocalClient();

beforeEach(async () => {
  await Promise.all(guestDb.tables.map((t) => t.clear()));
});

function makeFile(name: string, size: number, type = 'application/pdf'): File {
  const f = new File([new Uint8Array(Math.min(size, 16))], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

describe('planUpload (D13 gates)', () => {
  it('rejects the whole batch past 20 files', () => {
    const plan = planUpload(Array.from({ length: 21 }, (_, i) => makeFile(`f${i}.pdf`, 10)));
    expect(plan.tooMany).toBe(true);
    expect(plan.accepted).toEqual([]);
  });

  it('skips files over 25 MiB and keeps the rest', () => {
    const plan = planUpload([makeFile('ok.pdf', MAX_FILE_BYTES), makeFile('big.mov', MAX_FILE_BYTES + 1)]);
    expect(plan.tooMany).toBe(false);
    expect(plan.accepted.map((f) => f.name)).toEqual(['ok.pdf']);
    expect(plan.tooLarge).toEqual(['big.mov']);
  });
});

describe('drivePathSegments (D4)', () => {
  it('mirrors business / files / folder chain', () => {
    expect(
      drivePathSegments({ businessName: 'Shree Hall', folderChain: [{ name: 'Contracts' }, { name: '2026' }], folderId: 'y' }),
    ).toEqual(['Shree Hall', 'files', 'Contracts', '2026']);
    expect(drivePathSegments({ businessName: 'Hall', folderChain: [], folderId: null })).toEqual(['Hall', 'files']);
  });
});

describe('runUploadBatch', () => {
  it('uploads to Drive, then inserts the row with the Drive id (never before)', async () => {
    const calls: string[] = [];
    const uploader: FilesUploader = {
      async upload({ name, mimeType, pathSegments, onProgress }) {
        calls.push(`upload:${name}:${mimeType}:${pathSegments.join('/')}`);
        onProgress(0.5);
        return `drive-${name}`;
      },
    };
    const progress: [number, number][] = [];
    const result = await runUploadBatch([makeFile('a.pdf', 100), makeFile('b.bin', 200, '')], {
      db,
      businessId: 'b1',
      userId: 'u1',
      uploader,
      target: { businessName: 'Hall', folderChain: [{ name: 'Docs' }], folderId: 'fd' },
      onProgress: (done, total) => progress.push([done, total]),
    });
    expect(result.failed).toEqual([]);
    expect(result.uploaded.map((r) => [r.name, r.drive_file_id, r.folder_id, r.mime_type, r.size_bytes])).toEqual([
      ['a.pdf', 'drive-a.pdf', 'fd', 'application/pdf', 100],
      ['b.bin', 'drive-b.bin', 'fd', FALLBACK_MIME, 200],
    ]);
    expect(calls).toEqual(['upload:a.pdf:application/pdf:Hall/files/Docs', `upload:b.bin:${FALLBACK_MIME}:Hall/files/Docs`]);
    const rows = await guestDb.files.toArray();
    expect(rows.map((r) => r.drive_file_id).sort()).toEqual(['drive-a.pdf', 'drive-b.bin']);
    expect(rows.every((r) => r.created_by === 'u1' && r.business_id === 'b1')).toBe(true);
    expect(progress.at(-1)).toEqual([2, 2]);
  });

  it('isolates a failed Drive upload: no row for it, the others succeed', async () => {
    const uploader: FilesUploader = {
      async upload({ name }) {
        if (name === 'bad.pdf') {
          throw new Error('network');
        }
        return `drive-${name}`;
      },
    };
    const result = await runUploadBatch([makeFile('good.pdf', 1), makeFile('bad.pdf', 1)], {
      db,
      businessId: 'b1',
      userId: 'u1',
      uploader,
      target: { businessName: 'Hall', folderChain: [], folderId: null },
    });
    expect(result.uploaded.map((r) => r.name)).toEqual(['good.pdf']);
    expect(result.failed).toEqual(['bad.pdf']);
    expect((await guestDb.files.toArray()).map((r) => r.name)).toEqual(['good.pdf']);
  });

  it('sanitizes slashes out of file names (server CHECK)', async () => {
    const uploader: FilesUploader = { upload: async ({ name }) => `d-${name}` };
    const result = await runUploadBatch([makeFile('a/b.pdf', 1)], {
      db,
      businessId: 'b1',
      userId: 'u1',
      uploader,
      target: { businessName: 'Hall', folderChain: [], folderId: null },
    });
    expect(result.uploaded[0]?.name).toBe('a-b.pdf');
  });

  it('keeps at most UPLOAD_CONCURRENCY uploads in flight', async () => {
    let inFlight = 0;
    let peak = 0;
    const uploader: FilesUploader = {
      async upload({ name }) {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight -= 1;
        return `d-${name}`;
      },
    };
    await runUploadBatch(
      Array.from({ length: 8 }, (_, i) => makeFile(`f${i}.pdf`, 1)),
      { db, businessId: 'b1', userId: 'u1', uploader, target: { businessName: 'Hall', folderChain: [], folderId: null } },
    );
    expect(peak).toBeLessThanOrEqual(UPLOAD_CONCURRENCY);
    expect(peak).toBeGreaterThan(1);
    expect(await guestDb.files.count()).toBe(8);
  });
});
