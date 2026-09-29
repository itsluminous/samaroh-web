/**
 * Files tree / listing / search / validation logic (design §6, D11, D12, D13).
 */
import {
  collectSubtree,
  descendantCount,
  directChildCount,
  fileSizeParts,
  fileTypeKind,
  folderDepth,
  folderPath,
  hasThumbnail,
  isImageMime,
  listFolder,
  MAX_FILE_BYTES,
  MAX_FILES_PER_BATCH,
  pathLabel,
  pruneIndex,
  reachableFolders,
  sanitizeFileName,
  searchIndex,
  validateFolderName,
} from '@/app/[locale]/(app)/files/_lib/tree';
import type { FileRecord, FolderRecord } from '@/app/[locale]/(app)/files/_lib/types';

function folder(id: string, name: string, parent: string | null, extra: Partial<FolderRecord> = {}): FolderRecord {
  return {
    id,
    business_id: 'b1',
    parent_id: parent,
    name,
    restricted: false,
    created_by: 'u1',
    updated_by: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    deleted_at: null,
    ...extra,
  };
}

function file(id: string, name: string, folderId: string | null, extra: Partial<FileRecord> = {}): FileRecord {
  return {
    id,
    business_id: 'b1',
    folder_id: folderId,
    name,
    mime_type: 'application/pdf',
    size_bytes: 1024,
    drive_file_id: `d-${id}`,
    created_by: 'u1',
    created_at: `2026-09-${id.padStart(2, '0')}T00:00:00Z`,
    updated_at: '2026-09-01T00:00:00Z',
    deleted_at: null,
    ...extra,
  };
}

const contracts = folder('c', 'Contracts', null);
const y2026 = folder('y', '2026', 'c');
const photos = folder('p', 'photos', null, { restricted: true });
const orphanParent = folder('gone', 'Gone', null, { deleted_at: '2026-09-02T00:00:00Z' });
const orphanChild = folder('oc', 'Orphan child', 'gone');
const folders = [contracts, y2026, photos, orphanParent, orphanChild];
const files = [
  file('1', 'Agreement.pdf', 'c'),
  file('2', 'Cover.png', 'y', { mime_type: 'image/png' }),
  file('3', 'Top.txt', null, { mime_type: 'text/plain' }),
  file('4', 'Lost.pdf', 'gone'),
  file('5', 'Dead.pdf', null, { deleted_at: '2026-09-03T00:00:00Z' }),
  file('6', 'zeta.pdf', null),
];

describe('reachable tree (no server cascade → client prunes)', () => {
  it('drops tombstoned folders and everything under a broken chain', () => {
    const reach = reachableFolders(folders);
    expect([...reach.keys()].sort()).toEqual(['c', 'p', 'y']);
  });

  it('prunes files under tombstoned folders and tombstoned files', () => {
    const { files: live } = pruneIndex({ folders, files });
    expect(live.map((f) => f.id).sort()).toEqual(['1', '2', '3', '6']);
  });

  it('survives a corrupt parent cycle', () => {
    const a = folder('a', 'A', 'b');
    const b = folder('b', 'B', 'a');
    expect(reachableFolders([a, b]).size).toBe(0);
  });
});

describe('listing', () => {
  const { folders: reach, files: live } = pruneIndex({ folders, files });

  it('top level: folders A–Z then files newest first', () => {
    const top = listFolder(reach, live, null);
    expect(top.folders.map((f) => f.name)).toEqual(['Contracts', 'photos']);
    expect(top.files.map((f) => f.name)).toEqual(['zeta.pdf', 'Top.txt']);
  });

  it('inside a folder lists only direct children', () => {
    const inside = listFolder(reach, live, 'c');
    expect(inside.folders.map((f) => f.id)).toEqual(['y']);
    expect(inside.files.map((f) => f.id)).toEqual(['1']);
  });

  it('counts direct children and recursive descendants', () => {
    expect(directChildCount(reach, live, 'c')).toBe(2); // 2026 + Agreement
    expect(directChildCount(reach, live, 'p')).toBe(0);
    expect(descendantCount(reach, live, 'c')).toBe(3); // 2026, Agreement, Cover
    const sub = collectSubtree(reach, live, 'c');
    expect(sub.folders.map((f) => f.id)).toEqual(['y']);
    expect(sub.files.map((f) => f.id).sort()).toEqual(['1', '2']);
  });
});

describe('breadcrumbs', () => {
  const { folders: reach } = pruneIndex({ folders, files });

  it('builds the ancestor chain root → folder', () => {
    expect(folderPath(reach, 'y').map((f) => f.name)).toEqual(['Contracts', '2026']);
    expect(folderPath(reach, null)).toEqual([]);
    expect(folderPath(reach, 'missing')).toEqual([]);
    expect(folderDepth(reach, 'y')).toBe(2);
  });

  it('renders the catalog-driven path string', () => {
    expect(pathLabel('All files', '›', folderPath(reach, 'y'))).toBe('All files › Contracts › 2026');
    expect(pathLabel('All files', '›', [])).toBe('All files');
  });
});

describe('global search (D11)', () => {
  const { folders: reach, files: live } = pruneIndex({ folders, files });

  it('is case-insensitive substring over every reachable folder and file, folders first', () => {
    const hits = searchIndex(reach, live, 'co');
    expect(hits.map((h) => (h.kind === 'folder' ? `F:${h.folder.name}` : `f:${h.file.name}`))).toEqual([
      'F:Contracts',
      'f:Cover.png',
    ]);
    expect(hits[1]).toMatchObject({ parentId: 'y' });
  });

  it('returns nothing for an empty query (caller shows the current folder)', () => {
    expect(searchIndex(reach, live, '   ')).toEqual([]);
  });

  it('never surfaces pruned rows', () => {
    expect(searchIndex(reach, live, 'lost')).toEqual([]);
    expect(searchIndex(reach, live, 'dead')).toEqual([]);
    expect(searchIndex(reach, live, 'orphan')).toEqual([]);
  });
});

describe('folder name validation (D12)', () => {
  const siblings = [folder('a', 'Invoices', null), folder('b', 'Old', null, { deleted_at: '2026-01-01T00:00:00Z' })];

  it('required / invalid / duplicate', () => {
    expect(validateFolderName('   ', siblings)).toBe('name_required');
    expect(validateFolderName('a/b', siblings)).toBe('name_invalid');
    expect(validateFolderName('x'.repeat(121), siblings)).toBe('name_invalid');
    expect(validateFolderName('x'.repeat(120), siblings)).toBeNull();
    expect(validateFolderName('  INVOICES ', siblings)).toBe('duplicate');
    expect(validateFolderName('Receipts', siblings)).toBeNull();
  });

  it('a tombstoned sibling does not block reuse (live rows only)', () => {
    expect(validateFolderName('old', siblings)).toBeNull();
  });

  it('renaming a folder to its own name is not a duplicate', () => {
    expect(validateFolderName('invoices', siblings, 'a')).toBeNull();
  });
});

describe('file helpers', () => {
  it('sanitizes file names to the server CHECK', () => {
    expect(sanitizeFileName(' a/b.pdf ')).toBe('a-b.pdf');
    expect(sanitizeFileName('')).toBe('file');
    expect(sanitizeFileName('x'.repeat(300)).length).toBe(255);
  });

  it('MIME buckets and thumbnail eligibility', () => {
    expect(isImageMime('image/JPEG')).toBe(true);
    expect(hasThumbnail('application/pdf')).toBe(true);
    expect(hasThumbnail('text/plain')).toBe(false);
    expect(fileTypeKind('application/zip')).toBe('archive');
    expect(fileTypeKind('text/csv')).toBe('sheet');
    expect(fileTypeKind('video/mp4')).toBe('video');
    expect(fileTypeKind('application/octet-stream')).toBe('other');
  });

  it('size label parts: KB no decimals under 1 MB, MB one decimal above', () => {
    expect(fileSizeParts(500)).toEqual({ unit: 'kb', size: 1 });
    expect(fileSizeParts(300 * 1024)).toEqual({ unit: 'kb', size: 300 });
    expect(fileSizeParts(1.55 * 1024 * 1024)).toEqual({ unit: 'mb', size: 1.6 });
  });

  it('limits mirror the contract', () => {
    expect(MAX_FILE_BYTES).toBe(26_214_400);
    expect(MAX_FILES_PER_BATCH).toBe(20);
  });
});
