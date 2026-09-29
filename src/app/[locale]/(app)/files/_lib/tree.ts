/**
 * Pure folder-tree / listing / search logic for the Files module (design §6,
 * D11, D12, D13). No I/O — unit-tested directly.
 *
 * Client-side rules mirrored from the contract:
 * - A file (or folder) under a tombstoned/missing folder is hidden (no
 *   server cascade; the tree is pruned to what is reachable from the root).
 * - Folders sort A–Z (locale-aware), files newest first.
 * - Search is GLOBAL: case-insensitive name substring over every reachable
 *   folder and file, flat results with a path subtitle.
 * - Folder names: 1–120 chars after trim, no '/', unique per parent among
 *   LIVE siblings case-insensitively.
 */
import type { FileRecord, FilesIndex, FolderRecord } from './types';

export const FOLDER_NAME_MAX = 120;
export const FILE_NAME_MAX = 255;
/** Client depth cap (D13; the RLS chain cap is 64). */
export const FOLDER_DEPTH_MAX = 10;
/** 25 MiB — mirrors the server CHECK on files.size_bytes. */
export const MAX_FILE_BYTES = 26_214_400;
/** Files per picker/drop batch (D13). */
export const MAX_FILES_PER_BATCH = 20;

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/**
 * Live folders reachable from the root: drops tombstones AND every subtree
 * whose ancestor chain is broken (tombstoned or not returned by RLS). The
 * returned map is id → folder for O(1) lookups.
 */
export function reachableFolders(folders: readonly FolderRecord[]): Map<string, FolderRecord> {
  const live = new Map(folders.filter((f) => f.deleted_at === null).map((f) => [f.id, f]));
  const reachable = new Map<string, FolderRecord>();
  const memo = new Map<string, boolean>();
  const isReachable = (folder: FolderRecord, depth: number): boolean => {
    const cached = memo.get(folder.id);
    if (cached !== undefined) {
      return cached;
    }
    if (depth > 64) {
      memo.set(folder.id, false); // corrupt cycle guard (RLS cap parity)
      return false;
    }
    let ok: boolean;
    if (folder.parent_id === null) {
      ok = true;
    } else {
      const parent = live.get(folder.parent_id);
      ok = parent !== undefined && isReachable(parent, depth + 1);
    }
    memo.set(folder.id, ok);
    return ok;
  };
  for (const folder of live.values()) {
    if (isReachable(folder, 0)) {
      reachable.set(folder.id, folder);
    }
  }
  return reachable;
}

/** Live files whose folder (if any) is reachable. */
export function reachableFiles(files: readonly FileRecord[], folders: Map<string, FolderRecord>): FileRecord[] {
  return files.filter((f) => f.deleted_at === null && (f.folder_id === null || folders.has(f.folder_id)));
}

/** Prunes an index to what the tree rules make visible. */
export function pruneIndex(index: FilesIndex): { folders: Map<string, FolderRecord>; files: FileRecord[] } {
  const folders = reachableFolders(index.folders);
  return { folders, files: reachableFiles(index.files, folders) };
}

export function sortFolders(folders: readonly FolderRecord[]): FolderRecord[] {
  return [...folders].sort((a, b) => collator.compare(a.name, b.name) || a.id.localeCompare(b.id));
}

/** Newest first; ties broken by name for a stable order. */
export function sortFiles(files: readonly FileRecord[]): FileRecord[] {
  return [...files].sort(
    (a, b) => b.created_at.localeCompare(a.created_at) || collator.compare(a.name, b.name) || a.id.localeCompare(b.id),
  );
}

export interface FolderListing {
  folders: FolderRecord[];
  files: FileRecord[];
}

/** Direct children of `parentId` (null = top level), sorted per §6. */
export function listFolder(
  folders: Map<string, FolderRecord>,
  files: readonly FileRecord[],
  parentId: string | null,
): FolderListing {
  return {
    folders: sortFolders([...folders.values()].filter((f) => f.parent_id === parentId)),
    files: sortFiles(files.filter((f) => f.folder_id === parentId)),
  };
}

/** Number of live DIRECT children (subfolders + files) — the folder row's secondary line. */
export function directChildCount(
  folders: Map<string, FolderRecord>,
  files: readonly FileRecord[],
  folderId: string,
): number {
  let count = 0;
  for (const f of folders.values()) {
    if (f.parent_id === folderId) count += 1;
  }
  for (const f of files) {
    if (f.folder_id === folderId) count += 1;
  }
  return count;
}

/** Every reachable descendant (folders + files) of `folderId`, children-first per level. */
export function collectSubtree(
  folders: Map<string, FolderRecord>,
  files: readonly FileRecord[],
  folderId: string,
): { folders: FolderRecord[]; files: FileRecord[] } {
  const outFolders: FolderRecord[] = [];
  const outFiles: FileRecord[] = [];
  const queue = [folderId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const f of folders.values()) {
      if (f.parent_id === current) {
        outFolders.push(f);
        queue.push(f.id);
      }
    }
    for (const f of files) {
      if (f.folder_id === current) outFiles.push(f);
    }
  }
  return { folders: outFolders, files: outFiles };
}

/** Recursive live descendant count for the delete confirmation. */
export function descendantCount(folders: Map<string, FolderRecord>, files: readonly FileRecord[], folderId: string): number {
  const sub = collectSubtree(folders, files, folderId);
  return sub.folders.length + sub.files.length;
}

/** Ancestor chain root → … → the folder itself (empty for the top level / unknown ids). */
export function folderPath(folders: Map<string, FolderRecord>, folderId: string | null): FolderRecord[] {
  const chain: FolderRecord[] = [];
  let current = folderId === null ? undefined : folders.get(folderId);
  let guard = 0;
  while (current && guard < 64) {
    chain.unshift(current);
    current = current.parent_id === null ? undefined : folders.get(current.parent_id);
    guard += 1;
  }
  return chain;
}

/** Depth of a folder (top level = 0). */
export function folderDepth(folders: Map<string, FolderRecord>, folderId: string | null): number {
  return folderPath(folders, folderId).length;
}

/**
 * Renders the breadcrumb string both apps show under search results:
 * `All files › Contracts › 2026` (root label + separator from the catalog).
 */
export function pathLabel(rootLabel: string, separator: string, chain: readonly FolderRecord[]): string {
  return [rootLabel, ...chain.map((f) => f.name)].join(` ${separator} `);
}

export type SearchHit =
  | { kind: 'folder'; folder: FolderRecord; parentId: string | null }
  | { kind: 'file'; file: FileRecord; parentId: string | null };

/**
 * Global search (D11): case-insensitive name substring over every reachable
 * folder and file; folders first (A–Z), then files (newest first). Empty /
 * whitespace query → [] (the caller shows the current folder instead).
 */
export function searchIndex(folders: Map<string, FolderRecord>, files: readonly FileRecord[], query: string): SearchHit[] {
  const q = query.trim().toLocaleLowerCase();
  if (q === '') {
    return [];
  }
  const matches = (name: string) => name.toLocaleLowerCase().includes(q);
  const folderHits = sortFolders([...folders.values()].filter((f) => matches(f.name))).map(
    (folder): SearchHit => ({ kind: 'folder', folder, parentId: folder.parent_id }),
  );
  const fileHits = sortFiles(files.filter((f) => matches(f.name))).map(
    (file): SearchHit => ({ kind: 'file', file, parentId: file.folder_id }),
  );
  return [...folderHits, ...fileHits];
}

export type FolderNameError = 'name_required' | 'name_invalid' | 'duplicate';

/**
 * Folder-name validation mirroring the server CHECK + unique index: blank →
 * required; '/' or > 120 chars → invalid; case-insensitive clash with a LIVE
 * sibling (other than `selfId`, for renames) → duplicate.
 */
export function validateFolderName(
  raw: string,
  siblings: readonly FolderRecord[],
  selfId: string | null = null,
): FolderNameError | null {
  const name = raw.trim();
  if (name === '') {
    return 'name_required';
  }
  if (name.length > FOLDER_NAME_MAX || name.includes('/')) {
    return 'name_invalid';
  }
  const lower = name.toLocaleLowerCase();
  const clash = siblings.some(
    (s) => s.id !== selfId && s.deleted_at === null && s.name.trim().toLocaleLowerCase() === lower,
  );
  return clash ? 'duplicate' : null;
}

/** File names: 1–255 chars, no '/' (server CHECK). Sanitises rather than rejects. */
export function sanitizeFileName(raw: string): string {
  const cleaned = raw.replace(/\//g, '-').trim();
  const name = cleaned === '' ? 'file' : cleaned;
  return name.length > FILE_NAME_MAX ? name.slice(0, FILE_NAME_MAX) : name;
}

export function isImageMime(mime: string): boolean {
  return mime.toLowerCase().startsWith('image/');
}

export function isPdfMime(mime: string): boolean {
  return mime.toLowerCase() === 'application/pdf';
}

/** Images + PDFs get a Drive thumbnail (D16); everything else a type icon. */
export function hasThumbnail(mime: string): boolean {
  return isImageMime(mime) || isPdfMime(mime);
}

/** Coarse type bucket for the icon. */
export type FileTypeKind = 'image' | 'pdf' | 'video' | 'audio' | 'archive' | 'sheet' | 'doc' | 'other';

export function fileTypeKind(mime: string): FileTypeKind {
  const m = mime.toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m === 'application/pdf') return 'pdf';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (/zip|compressed|tar|rar|7z/.test(m)) return 'archive';
  if (/spreadsheet|excel|csv/.test(m)) return 'sheet';
  if (/msword|wordprocessing|text\//.test(m)) return 'doc';
  return 'other';
}

/**
 * Size label parts: `{unit: 'kb'|'mb', size}` — the caller formats `size`
 * with the locale number formatter (KB: no decimals, MB: one decimal; §6).
 */
export function fileSizeParts(bytes: number): { unit: 'kb' | 'mb'; size: number } {
  if (bytes >= 1024 * 1024) {
    return { unit: 'mb', size: Math.round((bytes / (1024 * 1024)) * 10) / 10 };
  }
  return { unit: 'kb', size: Math.max(1, Math.round(bytes / 1024)) };
}
