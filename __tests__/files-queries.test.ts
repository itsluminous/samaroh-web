/**
 * Files data layer against the guest local client (Dexie v4 stores for
 * folders / files / folder_access — the same calls the signed-in path makes
 * through the outbox layer): create/rename/tombstone folders (recursive,
 * children first), file tombstones, and the composite-PK soft-link
 * reconciliation of folder_access (D19: never a DELETE op; re-grant clears
 * the tombstone on the SAME row).
 */
import 'fake-indexeddb/auto';
import { createLocalClient } from '@/lib/guest/localClient';
import { guestDb, LOCAL_TABLES, COMPOSITE_PK } from '@/lib/guest/localDb';
import {
  createFolder,
  deleteFile,
  deleteFolderTree,
  fetchFilesIndex,
  fetchFolderAccess,
  insertFileRow,
  renameFolder,
  saveFolderAccess,
  setFolderRestricted,
} from '@/app/[locale]/(app)/files/_lib/queries';
import { pruneIndex } from '@/app/[locale]/(app)/files/_lib/tree';

const db = createLocalClient();

beforeEach(async () => {
  await Promise.all(guestDb.tables.map((t) => t.clear()));
});

describe('guest store (Dexie v4)', () => {
  it('declares the three 009 tables with folder_access keyed by the composite PK', () => {
    expect(LOCAL_TABLES).toEqual(expect.arrayContaining(['folders', 'files', 'folder_access']));
    expect(COMPOSITE_PK.folder_access).toEqual(['folder_id', 'member_id']);
    expect(guestDb.verno).toBe(4);
  });
});

describe('folders', () => {
  it('creates, renames and lists live rows', async () => {
    const top = await createFolder(db, 'b1', 'u1', null, '  Contracts ');
    expect(top.name).toBe('Contracts');
    expect(top.restricted).toBe(false);
    const child = await createFolder(db, 'b1', 'u1', top.id, '2026');
    const renamed = await renameFolder(db, child, 'u1', '2027');
    expect(renamed.name).toBe('2027');

    const index = await fetchFilesIndex(db, 'b1');
    expect(index.folders.map((f) => f.name).sort()).toEqual(['2027', 'Contracts']);
    expect(index.folders.find((f) => f.id === child.id)?.updated_by).toBe('u1');
  });

  it('owner flag: setFolderRestricted persists restricted', async () => {
    const f = await createFolder(db, 'b1', 'u1', null, 'Private');
    await setFolderRestricted(db, f, 'u1', true);
    const rows = await guestDb.folders.toArray();
    expect(rows[0]?.restricted).toBe(true);
  });

  it('deleteFolderTree tombstones every descendant file and folder, then the folder (no server cascade)', async () => {
    const a = await createFolder(db, 'b1', 'u1', null, 'A');
    const b = await createFolder(db, 'b1', 'u1', a.id, 'B');
    const c = await createFolder(db, 'b1', 'u1', b.id, 'C');
    const sibling = await createFolder(db, 'b1', 'u1', null, 'Keep');
    const f1 = await insertFileRow(db, 'b1', 'u1', { folderId: b.id, name: 'x.pdf', mimeType: 'application/pdf', sizeBytes: 10, driveFileId: 'd1' });
    const f2 = await insertFileRow(db, 'b1', 'u1', { folderId: c.id, name: 'y.pdf', mimeType: 'application/pdf', sizeBytes: 10, driveFileId: 'd2' });
    const keepFile = await insertFileRow(db, 'b1', 'u1', { folderId: sibling.id, name: 'z.pdf', mimeType: 'application/pdf', sizeBytes: 10, driveFileId: 'd3' });

    const before = pruneIndex(await fetchFilesIndex(db, 'b1'));
    const gone = await deleteFolderTree(db, a, 'u1', before.folders, before.files);
    expect(gone.files.map((f) => f.id).sort()).toEqual([f1.id, f2.id].sort());
    expect(gone.folders.map((f) => f.id)).toEqual([b.id, c.id, a.id]);

    const after = await fetchFilesIndex(db, 'b1');
    expect(after.folders.map((f) => f.id)).toEqual([sibling.id]);
    expect(after.files.map((f) => f.id)).toEqual([keepFile.id]);
    // Tombstoned, not hard-deleted (sync engines never hard-delete).
    const all = await guestDb.folders.toArray();
    expect(all.filter((r) => r.deleted_at !== null).map((r) => r.id).sort()).toEqual([a.id, b.id, c.id].sort());
  });
});

describe('files', () => {
  it('inserts the metadata row only with a Drive id and tombstones on delete', async () => {
    const row = await insertFileRow(db, 'b1', 'u1', { folderId: null, name: 'bill.pdf', mimeType: 'application/pdf', sizeBytes: 2048, driveFileId: 'drv' });
    expect(row.drive_file_id).toBe('drv');
    expect(row.folder_id).toBeNull();
    await deleteFile(db, row);
    expect((await fetchFilesIndex(db, 'b1')).files).toEqual([]);
    expect((await guestDb.files.toArray())[0]?.deleted_at).not.toBeNull();
  });
});

describe('folder_access soft links (composite PK)', () => {
  it('grants insert, revokes tombstone, re-grant clears the tombstone on the same row', async () => {
    const folder = await createFolder(db, 'b1', 'u1', null, 'Private');
    let access = await saveFolderAccess(db, folder, ['m1', 'm2'], []);
    expect(access.filter((a) => a.deleted_at === null).map((a) => a.member_id).sort()).toEqual(['m1', 'm2']);
    expect(await guestDb.folder_access.count()).toBe(2);

    access = await saveFolderAccess(db, folder, ['m2'], access);
    const m1 = access.find((a) => a.member_id === 'm1');
    expect(m1?.deleted_at).not.toBeNull();
    expect(await guestDb.folder_access.count()).toBe(2); // never a DELETE op

    access = await saveFolderAccess(db, folder, ['m1', 'm2'], access);
    expect(access.find((a) => a.member_id === 'm1')?.deleted_at).toBeNull();
    expect(await guestDb.folder_access.count()).toBe(2); // same PK row reused

    const fetched = await fetchFolderAccess(db, 'b1');
    expect(fetched.map((a) => `${a.folder_id}|${a.member_id}|${a.deleted_at === null}`).sort()).toEqual([
      `${folder.id}|m1|true`,
      `${folder.id}|m2|true`,
    ]);
  });

  it('leaves other folders’ rows untouched', async () => {
    const f1 = await createFolder(db, 'b1', 'u1', null, 'One');
    const f2 = await createFolder(db, 'b1', 'u1', null, 'Two');
    let access = await saveFolderAccess(db, f1, ['m1'], []);
    access = await saveFolderAccess(db, f2, ['m9'], access);
    access = await saveFolderAccess(db, f1, [], access);
    expect(access.find((a) => a.folder_id === f2.id && a.member_id === 'm9')?.deleted_at).toBeNull();
    expect(access.find((a) => a.folder_id === f1.id && a.member_id === 'm1')?.deleted_at).not.toBeNull();
  });
});
