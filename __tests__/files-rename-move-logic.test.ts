/**
 * Rename / move / lazy-tree logic (owner feedback 2026-09-30; shared
 * migration 010): file-name validation (no sibling uniqueness — names may
 * repeat), the lazy picker rows (root folders only until expanded, hidden
 * moved subtree), folder-move validation (same place / cycle / depth cap /
 * duplicate name in the destination), and the RLS-mirroring file gating.
 */
import {
  ancestorIds,
  canModifyFile,
  FILE_NAME_MAX,
  FOLDER_DEPTH_MAX,
  isSelfOrDescendant,
  lazyFolderTreeRows,
  reachableFolders,
  subtreeHeight,
  validateFileMove,
  validateFileName,
  validateFolderMove,
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

function file(id: string, folderId: string | null, createdBy = 'u1'): FileRecord {
  return {
    id,
    business_id: 'b1',
    folder_id: folderId,
    name: `${id}.pdf`,
    mime_type: 'application/pdf',
    size_bytes: 1,
    drive_file_id: `d-${id}`,
    created_by: createdBy,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    deleted_at: null,
  };
}

//  A ─ A1 ─ A1a
//    └ A2
//  B
//  zebra ─ z1
const A = folder('a', 'A', null);
const A1 = folder('a1', 'A1', 'a');
const A1a = folder('a1a', 'A1a', 'a1');
const A2 = folder('a2', 'A2', 'a');
const B = folder('b', 'B', null);
const Z = folder('z', 'zebra', null);
const Z1 = folder('z1', 'z1', 'z');
const tree = reachableFolders([A, A1, A1a, A2, B, Z, Z1, folder('gone', 'gone', null, { deleted_at: '2026-09-02T00:00:00Z' })]);

describe('validateFileName (rename file)', () => {
  it('requires a non-blank name', () => {
    expect(validateFileName('   ')).toBe('name_required');
  });
  it('rejects "/" and over-long names (server CHECK)', () => {
    expect(validateFileName('a/b.pdf')).toBe('name_invalid');
    expect(validateFileName('x'.repeat(FILE_NAME_MAX + 1))).toBe('name_invalid');
    expect(validateFileName('x'.repeat(FILE_NAME_MAX))).toBeNull();
  });
  it('has no duplicate rule — file names may repeat within a folder (D12)', () => {
    expect(validateFileName('same.pdf')).toBeNull();
  });
});

describe('lazyFolderTreeRows (picker item 2)', () => {
  const names = (rows: ReturnType<typeof lazyFolderTreeRows>) => rows.map((r) => `${r.folder.name}@${r.depth}${r.hasChildren ? '+' : ''}${r.expanded ? '*' : ''}`);

  it('lists ROOT folders only when nothing is expanded, flagging the ones with children', () => {
    expect(names(lazyFolderTreeRows(tree, new Set()))).toEqual(['A@0+', 'B@0', 'zebra@0+']);
  });

  it('expanding reveals direct children (indented one level) — grandchildren stay hidden until their parent expands', () => {
    expect(names(lazyFolderTreeRows(tree, new Set(['a'])))).toEqual(['A@0+*', 'A1@1+', 'A2@1', 'B@0', 'zebra@0+']);
    expect(names(lazyFolderTreeRows(tree, new Set(['a', 'a1'])))).toEqual(['A@0+*', 'A1@1+*', 'A1a@2', 'A2@1', 'B@0', 'zebra@0+']);
  });

  it('an expanded id without visible children is inert (a leaf never reports expanded)', () => {
    expect(names(lazyFolderTreeRows(tree, new Set(['b', 'a1'])))).toEqual(['A@0+', 'B@0', 'zebra@0+']);
  });

  it('excludes the moved folder AND its subtree (it can never be its own destination)', () => {
    const rows = lazyFolderTreeRows(tree, new Set(['a', 'a1']), 'a1');
    expect(names(rows)).toEqual(['A@0+*', 'A2@1', 'B@0', 'zebra@0+']);
    // A folder whose only child is excluded shows no chevron.
    expect(names(lazyFolderTreeRows(tree, new Set(), 'z1'))).toEqual(['A@0+', 'B@0', 'zebra@0']);
  });

  it('ancestorIds = the ids to pre-expand so the preselected row is visible', () => {
    expect([...ancestorIds(tree, 'a1a')]).toEqual(['a', 'a1']);
    expect([...ancestorIds(tree, 'a')]).toEqual([]);
    expect([...ancestorIds(tree, null)]).toEqual([]);
  });
});

describe('validateFolderMove (cycle guard + depth cap + duplicate)', () => {
  it('same parent → same_folder (nothing to do)', () => {
    expect(validateFolderMove(tree, A1, 'a')).toBe('same_folder');
    expect(validateFolderMove(tree, B, null)).toBe('same_folder');
  });

  it('into itself or a descendant → into_self', () => {
    expect(validateFolderMove(tree, A, 'a')).toBe('into_self');
    expect(validateFolderMove(tree, A, 'a1a')).toBe('into_self');
    expect(isSelfOrDescendant(tree, 'a', 'a2')).toBe(true);
    expect(isSelfOrDescendant(tree, 'a1', 'a2')).toBe(false);
    expect(isSelfOrDescendant(tree, 'a', null)).toBe(false);
  });

  it('a valid move: sibling root, into another root, to the top level', () => {
    expect(validateFolderMove(tree, A1, 'b')).toBeNull();
    expect(validateFolderMove(tree, A1, null)).toBeNull();
    expect(validateFolderMove(tree, Z1, 'a1a')).toBeNull();
  });

  it('depth cap: destination depth + moved subtree height must stay ≤ FOLDER_DEPTH_MAX', () => {
    expect(subtreeHeight(tree, 'a')).toBe(3);
    expect(subtreeHeight(tree, 'b')).toBe(1);
    // Build a chain of depth 9 and try to hang A (height 3) / B (height 1) under its tail.
    const chain: FolderRecord[] = [];
    for (let i = 1; i <= FOLDER_DEPTH_MAX - 1; i += 1) {
      chain.push(folder(`d${i}`, `D${i}`, i === 1 ? null : `d${i - 1}`));
    }
    const deep = reachableFolders([A, A1, A1a, A2, B, ...chain]);
    expect(validateFolderMove(deep, A, `d${FOLDER_DEPTH_MAX - 1}`)).toBe('too_deep'); // 9 + 3
    expect(validateFolderMove(deep, A, `d${FOLDER_DEPTH_MAX - 3}`)).toBeNull(); // 7 + 3 = 10
    expect(validateFolderMove(deep, B, `d${FOLDER_DEPTH_MAX - 1}`)).toBeNull(); // 9 + 1
  });

  it('duplicate name (case-insensitive, live siblings) in the destination → duplicate_folder', () => {
    const withClash = reachableFolders([A, A1, A2, B, folder('bx', 'a1', 'b')]);
    expect(validateFolderMove(withClash, A1, 'b')).toBe('duplicate_folder');
    const tombstoned = reachableFolders([A, A1, A2, B, folder('bx', 'a1', 'b', { deleted_at: '2026-09-02T00:00:00Z' })]);
    expect(validateFolderMove(tombstoned, A1, 'b')).toBeNull();
  });

  it('validateFileMove only rejects the no-op', () => {
    expect(validateFileMove(file('f', 'a'), 'a')).toBe('same_folder');
    expect(validateFileMove(file('f', 'a'), null)).toBeNull();
    expect(validateFileMove(file('f', null), 'b')).toBeNull();
  });
});

describe('canModifyFile (rename/move gating mirrors files_update RLS)', () => {
  const mine = file('m', null, 'me');
  const theirs = file('t', null, 'someone-else');
  it('owner and files.delete holders may modify any file', () => {
    expect(canModifyFile(theirs, { isOwner: true, userId: 'me', canUpload: false, canDelete: false })).toBe(true);
    expect(canModifyFile(theirs, { isOwner: false, userId: 'me', canUpload: false, canDelete: true })).toBe(true);
  });
  it('files.upload alone covers the member\'s OWN uploads only', () => {
    expect(canModifyFile(mine, { isOwner: false, userId: 'me', canUpload: true, canDelete: false })).toBe(true);
    expect(canModifyFile(theirs, { isOwner: false, userId: 'me', canUpload: true, canDelete: false })).toBe(false);
  });
  it('a viewer (no upload, no delete) never', () => {
    expect(canModifyFile(mine, { isOwner: false, userId: 'me', canUpload: false, canDelete: false })).toBe(false);
    expect(canModifyFile(mine, { isOwner: false, userId: null, canUpload: true, canDelete: false })).toBe(false);
  });
});
