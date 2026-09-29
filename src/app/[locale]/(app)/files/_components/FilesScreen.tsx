'use client';

/**
 * Files tab (shared design docs/files-tab-design.md — the cross-platform
 * contract). Drive-indexed file storage: the Supabase `folders` / `files`
 * rows are the authoritative metadata index, bytes live in the uploader's
 * Google Drive (anyone-with-link). Folder breadcrumbs, list/grid toggle
 * (persisted per device), GLOBAL search (D11), New folder / Upload (picker +
 * drag-and-drop, any MIME, ≤20 per batch, ≤25 MiB each), per-item kebab
 * actions, owner-only Manage access. Every action is permission-HIDDEN
 * (never greyed, ADR-038): `files.upload`, `files.manage_folders` (inherits
 * upload when absent), `files.delete`; only the owner sees Manage access.
 *
 * Route: `/files/[[...folder]]` — one mounted screen for the top level and
 * every folder (the optional catch-all keeps state across folder navigation;
 * the index is loaded once and updated optimistically).
 *
 * Guest mode: folders and the index work against the local Dexie store;
 * uploads need a Google account, so the Upload affordance is replaced by
 * `files.upload.guest_hint`. Without NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID the
 * upload action shows `files.upload.not_configured`.
 */

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import CreateNewFolderOutlinedIcon from '@mui/icons-material/CreateNewFolderOutlined';
import FolderIcon from '@mui/icons-material/Folder';
import GridViewIcon from '@mui/icons-material/GridView';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SearchIcon from '@mui/icons-material/Search';
import ViewListIcon from '@mui/icons-material/ViewList';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import { type ChangeEvent, type DragEvent, type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { driveDeleteFileBestEffort, getDriveAccessToken, hasDriveToken, isDriveConfigured } from '@/lib/google/drive';
import { isLocalClient } from '@/lib/guest/localClient';
import { driveDownloadUrl, driveViewUrl } from '@/lib/images/drive';
import { fetchMembers } from '@/lib/permissions/membersRepo';
import { useMembership } from '@/lib/permissions/useMembership';
import { createFolder, deleteFile, deleteFolderTree, fetchFilesIndex, renameFolder } from '../_lib/queries';
import {
  descendantCount,
  directChildCount,
  fileSizeParts,
  folderDepth,
  FOLDER_DEPTH_MAX,
  folderPath,
  isImageMime,
  listFolder,
  MAX_FILES_PER_BATCH,
  pathLabel,
  pruneIndex,
  searchIndex,
} from '../_lib/tree';
import type { FileRecord, FilesViewMode, FolderRecord } from '../_lib/types';
import { createDriveFilesUploader, planUpload, runUploadBatch } from '../_lib/upload';
import FileLightbox from './FileLightbox';
import FileThumb from './FileThumb';
import FolderAccessDialog from './FolderAccessDialog';
import FolderNameDialog from './FolderNameDialog';

const VIEW_MODE_KEY = 'samaroh_files_view';

type MenuTarget = { kind: 'file'; file: FileRecord } | { kind: 'folder'; folder: FolderRecord };

interface UploadProgress {
  done: number;
  total: number;
  fraction: number;
}

function readViewMode(): FilesViewMode {
  try {
    return localStorage.getItem(VIEW_MODE_KEY) === 'grid' ? 'grid' : 'list';
  } catch {
    return 'list';
  }
}

/** Best-effort Drive delete of the copies this browser's linked account owns (D10). */
async function bestEffortDriveDelete(files: readonly FileRecord[]): Promise<void> {
  if (!hasDriveToken()) {
    return;
  }
  const token = await getDriveAccessToken({ interactive: false }).catch(() => null);
  if (!token) {
    return;
  }
  for (const file of files) {
    await driveDeleteFileBestEffort(token, file.drive_file_id);
  }
}

export default function FilesScreen({ folderId }: { folderId: string | null }) {
  const t = useTranslations('files');
  const tCommon = useTranslations('common');
  const tMenuSearch = useTranslations('menu.search');
  const tError = useTranslations('expenses.error');
  const format = useFormatter();
  const router = useRouter();
  const {
    supabase,
    business,
    userId,
    isOwner,
    permissions,
    loading: membershipLoading,
    error: membershipError,
  } = useMembership();
  const businessId = business?.id ?? null;
  const guest = isLocalClient(supabase);
  const canUpload = isOwner || permissions.files.upload;
  const canManageFolders = isOwner || permissions.files.manage_folders;
  const canDelete = isOwner || permissions.files.delete;

  const [index, setIndex] = useState<{ folders: FolderRecord[]; files: FileRecord[] }>({ folders: [], files: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [memberNames, setMemberNames] = useState<Map<string, string>>(new Map());
  const [viewMode, setViewMode] = useState<FilesViewMode>('list');
  const [query, setQuery] = useState('');
  const [snack, setSnack] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; target: MenuTarget } | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<FolderRecord | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<FolderRecord | null>(null);
  const [deleteFileTarget, setDeleteFileTarget] = useState<FileRecord | null>(null);
  const [accessTarget, setAccessTarget] = useState<FolderRecord | null>(null);
  const [lightbox, setLightbox] = useState<FileRecord | null>(null);
  const [pendingUpload, setPendingUpload] = useState<File[] | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    setViewMode(readViewMode());
  }, []);

  const reload = useCallback(async () => {
    if (!supabase || !businessId) {
      return;
    }
    setLoadError(false);
    try {
      const data = await fetchFilesIndex(supabase, businessId);
      setIndex(data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
    // "Added by" names: owners see every member row, members only their own
    // (002 RLS) — best effort, the line is omitted when unknown.
    try {
      const members = await fetchMembers(supabase, businessId);
      setMemberNames(new Map(members.filter((m) => m.user_id).map((m) => [m.user_id as string, m.display_name])));
    } catch {
      // optional detail line
    }
  }, [supabase, businessId]);

  useEffect(() => {
    if (membershipLoading) {
      return;
    }
    if (!supabase || !businessId) {
      setLoading(false);
      return;
    }
    void reload();
  }, [membershipLoading, supabase, businessId, reload]);

  const pruned = useMemo(() => pruneIndex(index), [index]);
  const currentFolder = folderId ? (pruned.folders.get(folderId) ?? null) : null;
  const folderMissing = folderId !== null && currentFolder === null;
  const chain = useMemo(() => folderPath(pruned.folders, folderId), [pruned, folderId]);
  const listing = useMemo(() => listFolder(pruned.folders, pruned.files, folderMissing ? null : folderId), [pruned, folderId, folderMissing]);
  const trimmedQuery = query.trim();
  const searchHits = useMemo(() => searchIndex(pruned.folders, pruned.files, query), [pruned, query]);
  const separator = t('breadcrumb.separator');
  const rootLabel = t('home.root_label');

  const navigateTo = (id: string | null) => {
    setQuery('');
    router.push(id ? `/files/${id}` : '/files');
  };

  const addedBy = (file: FileRecord): string | null => {
    const name = memberNames.get(file.created_by) ?? (business && file.created_by === business.owner_user_id ? business.owner_name : null);
    return name ? t('file.added_by', { name }) : null;
  };

  const sizeLabel = (bytes: number): string => {
    const parts = fileSizeParts(bytes);
    return parts.unit === 'mb'
      ? t('file.size_mb', { size: format.number(parts.size, { maximumFractionDigits: 1 }) })
      : t('file.size_kb', { size: format.number(parts.size, { maximumFractionDigits: 0 }) });
  };

  const toggleView = () => {
    const next: FilesViewMode = viewMode === 'list' ? 'grid' : 'list';
    setViewMode(next);
    try {
      localStorage.setItem(VIEW_MODE_KEY, next);
    } catch {
      // per-device preference only
    }
  };

  // ---- folder actions ----

  const handleCreateFolder = async (name: string) => {
    if (!supabase || !businessId || !userId) {
      return;
    }
    const created = await createFolder(supabase, businessId, userId, folderMissing ? null : folderId, name);
    setIndex((prev) => ({ ...prev, folders: [...prev.folders, created] }));
    setSnack(t('folder.created'));
  };

  const handleRenameFolder = async (name: string) => {
    if (!supabase || !userId || !renameTarget) {
      return;
    }
    const next = await renameFolder(supabase, renameTarget, userId, name);
    setIndex((prev) => ({ ...prev, folders: prev.folders.map((f) => (f.id === next.id ? next : f)) }));
    setSnack(t('folder.renamed'));
  };

  const handleDeleteFolder = async () => {
    if (!supabase || !userId || !deleteFolderTarget) {
      return;
    }
    const target = deleteFolderTarget;
    setDeleteFolderTarget(null);
    try {
      const gone = await deleteFolderTree(supabase, target, userId, pruned.folders, pruned.files);
      const goneFolders = new Set(gone.folders.map((f) => f.id));
      const goneFiles = new Set(gone.files.map((f) => f.id));
      setIndex((prev) => ({
        folders: prev.folders.filter((f) => !goneFolders.has(f.id)),
        files: prev.files.filter((f) => !goneFiles.has(f.id)),
      }));
      setSnack(t('folder.deleted'));
      if (folderId && goneFolders.has(folderId)) {
        navigateTo(target.parent_id);
      }
      void bestEffortDriveDelete(gone.files);
    } catch {
      setSnack(tError('save_failed'));
    }
  };

  // ---- file actions ----

  const openFile = (file: FileRecord) => {
    if (isImageMime(file.mime_type)) {
      setLightbox(file);
    } else {
      window.open(driveViewUrl(file.drive_file_id), '_blank', 'noopener,noreferrer');
    }
  };

  const copyLink = async (file: FileRecord) => {
    try {
      await navigator.clipboard.writeText(driveViewUrl(file.drive_file_id));
      setSnack(t('action.link_copied'));
    } catch {
      setSnack(t('file.open_failed'));
    }
  };

  const handleDeleteFile = async () => {
    if (!supabase || !deleteFileTarget) {
      return;
    }
    const target = deleteFileTarget;
    setDeleteFileTarget(null);
    try {
      await deleteFile(supabase, target);
      setIndex((prev) => ({ ...prev, files: prev.files.filter((f) => f.id !== target.id) }));
      setSnack(t('file.deleted'));
      void bestEffortDriveDelete([target]);
    } catch {
      setSnack(tError('save_failed'));
    }
  };

  // ---- upload ----

  const runUpload = async (files: File[]) => {
    if (!supabase || !businessId || !userId || !business) {
      return;
    }
    setProgress({ done: 0, total: files.length, fraction: 0 });
    try {
      const result = await runUploadBatch(files, {
        db: supabase,
        businessId,
        userId,
        uploader: createDriveFilesUploader(supabase, userId),
        target: { businessName: business.name, folderChain: chain, folderId: folderMissing ? null : folderId },
        onProgress: (done, total, fraction) => setProgress({ done, total, fraction }),
      });
      if (result.uploaded.length > 0) {
        setIndex((prev) => ({ ...prev, files: [...result.uploaded, ...prev.files] }));
      }
      if (result.failed.length > 0) {
        setSnack(t('upload.failed', { name: result.failed.join(', ') }));
      } else {
        setSnack(t('upload.done', { count: result.uploaded.length }));
      }
    } finally {
      setProgress(null);
    }
  };

  const startUpload = (picked: File[]) => {
    if (!canUpload || picked.length === 0) {
      return;
    }
    if (guest) {
      setSnack(t('upload.guest_hint'));
      return;
    }
    if (!isDriveConfigured()) {
      setSnack(t('upload.not_configured'));
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSnack(tCommon('state.offline_banner'));
      return;
    }
    const plan = planUpload(picked);
    if (plan.tooMany) {
      setSnack(t('upload.too_many', { max: MAX_FILES_PER_BATCH }));
      return;
    }
    if (plan.tooLarge.length > 0) {
      setSnack(t('upload.too_large', { name: plan.tooLarge.join(', ') }));
    }
    if (plan.accepted.length === 0) {
      return;
    }
    if (!hasDriveToken()) {
      // Connect-Google prompt (D8): the popup itself is opened from the
      // dialog's Connect button (user gesture — popup blockers).
      setPendingUpload(plan.accepted);
      return;
    }
    void runUpload(plan.accepted);
  };

  const connectAndUpload = async () => {
    const files = pendingUpload;
    setPendingUpload(null);
    if (!files) {
      return;
    }
    try {
      const token = await getDriveAccessToken({ interactive: true });
      if (!token) {
        setSnack(t('upload.link_failed'));
        return;
      }
    } catch {
      setSnack(t('upload.link_failed'));
      return;
    }
    await runUpload(files);
  };

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    startUpload(picked);
  };

  const dropEnabled = canUpload && !guest;
  const onDragEnter = (event: DragEvent) => {
    if (!dropEnabled || !event.dataTransfer.types.includes('Files')) {
      return;
    }
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragOver = (event: DragEvent) => {
    if (dropEnabled && event.dataTransfer.types.includes('Files')) {
      event.preventDefault();
    }
  };
  const onDragLeave = () => {
    if (!dropEnabled) {
      return;
    }
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) {
      setDragging(false);
    }
  };
  const onDrop = (event: DragEvent) => {
    if (!dropEnabled) {
      return;
    }
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    startUpload(Array.from(event.dataTransfer.files));
  };

  // ---- render helpers ----

  const openMenu = (event: MouseEvent<HTMLElement>, target: MenuTarget) => {
    event.stopPropagation();
    event.preventDefault();
    setMenu({ anchor: event.currentTarget, target });
  };
  const closeMenu = (then?: () => void) => {
    setMenu(null);
    then?.();
  };
  const menuFile = menu?.target.kind === 'file' ? menu.target.file : null;
  const menuFolder = menu?.target.kind === 'folder' ? menu.target.folder : null;

  const folderSecondary = (folder: FolderRecord) => {
    const count = directChildCount(pruned.folders, pruned.files, folder.id);
    return count === 0 ? t('folder.item_count_empty') : t('folder.item_count', { count });
  };

  const fileSecondary = (file: FileRecord) => {
    const by = addedBy(file);
    return by ? `${sizeLabel(file.size_bytes)} · ${by}` : sizeLabel(file.size_bytes);
  };

  const restrictedChip = (folder: FolderRecord) =>
    folder.restricted ? <Chip size="small" icon={<LockOutlinedIcon />} label={t('access.restricted_badge')} /> : null;

  const kebab = (target: MenuTarget, name: string) => {
    // Permission-hidden: no kebab at all when no action applies.
    const hasActions = target.kind === 'file' ? true : canManageFolders || canDelete || isOwner;
    if (!hasActions) {
      return null;
    }
    return (
      <IconButton edge="end" size="small" aria-label={t('action.more', { name })} onClick={(e) => openMenu(e, target)}>
        <MoreVertIcon fontSize="small" />
      </IconButton>
    );
  };

  const renderFolderRow = (folder: FolderRecord, secondary: string) => (
    <ListItem key={`folder-${folder.id}`} disablePadding divider secondaryAction={kebab({ kind: 'folder', folder }, folder.name)}>
      <ListItemButton onClick={() => navigateTo(folder.id)}>
        <ListItemIcon>
          <FolderIcon color="primary" aria-label={t('folder.icon_a11y')} />
        </ListItemIcon>
        <ListItemText primary={folder.name} secondary={secondary} primaryTypographyProps={{ noWrap: true }} />
        {restrictedChip(folder)}
      </ListItemButton>
    </ListItem>
  );

  const renderFileRow = (file: FileRecord, secondary: string) => (
    <ListItem key={`file-${file.id}`} disablePadding divider secondaryAction={kebab({ kind: 'file', file }, file.name)}>
      <ListItemButton onClick={() => openFile(file)}>
        <ListItemIcon>
          <FileThumb driveFileId={file.drive_file_id} mimeType={file.mime_type} alt={t('file.thumbnail_a11y', { name: file.name })} size={40} />
        </ListItemIcon>
        <ListItemText primary={file.name} secondary={secondary} primaryTypographyProps={{ noWrap: true }} sx={{ ml: 1 }} />
      </ListItemButton>
    </ListItem>
  );

  const renderGrid = (folders: FolderRecord[], files: FileRecord[]) => (
    <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
      {folders.map((folder) => (
        <Paper key={`folder-${folder.id}`} variant="outlined" sx={{ position: 'relative', p: 1.5 }}>
          <Box
            component="button"
            type="button"
            onClick={() => navigateTo(folder.id)}
            sx={{ all: 'unset', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: 0.5 }}
          >
            <FolderIcon color="primary" sx={{ fontSize: 56 }} aria-label={t('folder.icon_a11y')} />
            <Typography variant="body2" noWrap sx={{ maxWidth: '100%' }}>
              {folder.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {folderSecondary(folder)}
            </Typography>
            {restrictedChip(folder)}
          </Box>
          <Box sx={{ position: 'absolute', top: 4, right: 4 }}>{kebab({ kind: 'folder', folder }, folder.name)}</Box>
        </Paper>
      ))}
      {files.map((file) => (
        <Paper key={`file-${file.id}`} variant="outlined" sx={{ position: 'relative', p: 1.5 }}>
          <Box
            component="button"
            type="button"
            onClick={() => openFile(file)}
            sx={{ all: 'unset', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: 0.5 }}
          >
            <FileThumb driveFileId={file.drive_file_id} mimeType={file.mime_type} alt={t('file.thumbnail_a11y', { name: file.name })} size={96} />
            <Typography variant="body2" noWrap sx={{ maxWidth: '100%' }}>
              {file.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {sizeLabel(file.size_bytes)}
            </Typography>
          </Box>
          <Box sx={{ position: 'absolute', top: 4, right: 4 }}>{kebab({ kind: 'file', file }, file.name)}</Box>
        </Paper>
      ))}
    </Box>
  );

  // ---- states ----

  if (membershipLoading || loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress aria-label={tCommon('state.loading')} />
      </Box>
    );
  }

  if (membershipError || !supabase || !businessId) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h6">{t('home.empty_title')}</Typography>
      </Box>
    );
  }

  if (loadError) {
    return <Alert severity="error">{tError('load_failed')}</Alert>;
  }

  const title = currentFolder ? currentFolder.name : t('home.title');
  const canCreateHere = canManageFolders && folderDepth(pruned.folders, folderMissing ? null : folderId) < FOLDER_DEPTH_MAX;
  const showEmptyMessage = canUpload || canManageFolders;

  return (
    <Box
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      sx={{ position: 'relative', minHeight: '60vh', pb: 8 }}
    >
      {dragging ? (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 2,
            borderStyle: 'dashed',
            borderColor: 'primary.main',
            borderRadius: 2,
            bgcolor: 'rgba(0,0,0,0.04)',
            pointerEvents: 'none',
          }}
        >
          <Stack alignItems="center" spacing={1}>
            <CloudUploadOutlinedIcon color="primary" sx={{ fontSize: 48 }} />
            <Typography color="primary">{t('upload.drop_hint')}</Typography>
          </Stack>
        </Box>
      ) : null}

      {/* Header: up affordance + title + toolbar */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        {folderId !== null ? (
          <IconButton aria-label={t('breadcrumb.up')} onClick={() => navigateTo(currentFolder?.parent_id ?? null)}>
            <ArrowBackIcon />
          </IconButton>
        ) : null}
        <Typography variant="h5" component="h1" noWrap sx={{ flexGrow: 1, minWidth: 0 }}>
          {title}
        </Typography>
        <Tooltip title={viewMode === 'list' ? t('view.grid') : t('view.list')}>
          <IconButton aria-label={viewMode === 'list' ? t('view.grid') : t('view.list')} onClick={toggleView}>
            {viewMode === 'list' ? <GridViewIcon /> : <ViewListIcon />}
          </IconButton>
        </Tooltip>
        {canCreateHere ? (
          <Button variant="outlined" startIcon={<CreateNewFolderOutlinedIcon />} onClick={() => setNewFolderOpen(true)} sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>
            {t('action.new_folder')}
          </Button>
        ) : null}
        {canCreateHere ? (
          <IconButton aria-label={t('action.new_folder')} onClick={() => setNewFolderOpen(true)} sx={{ display: { xs: 'inline-flex', sm: 'none' } }}>
            <CreateNewFolderOutlinedIcon />
          </IconButton>
        ) : null}
        {canUpload && !guest ? (
          <>
            <Button
              variant="contained"
              startIcon={<CloudUploadOutlinedIcon />}
              onClick={() => fileInputRef.current?.click()}
              disabled={progress !== null}
              sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
            >
              {t('action.upload')}
            </Button>
            <IconButton
              aria-label={t('action.upload')}
              color="primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={progress !== null}
              sx={{ display: { xs: 'inline-flex', sm: 'none' } }}
            >
              <CloudUploadOutlinedIcon />
            </IconButton>
            <input ref={fileInputRef} type="file" multiple hidden onChange={onPick} aria-label={t('action.upload')} />
          </>
        ) : null}
      </Stack>

      {canUpload && guest ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          {t('upload.guest_hint')}
        </Typography>
      ) : null}

      {/* Breadcrumbs */}
      <Breadcrumbs separator={separator} aria-label={rootLabel} sx={{ mb: 2 }}>
        {folderId === null && trimmedQuery === '' ? (
          <Typography color="text.primary">{rootLabel}</Typography>
        ) : (
          <Link component="button" type="button" underline="hover" color="inherit" onClick={() => navigateTo(null)}>
            {rootLabel}
          </Link>
        )}
        {chain.map((crumb, i) =>
          i === chain.length - 1 && trimmedQuery === '' ? (
            <Typography key={crumb.id} color="text.primary">
              {crumb.name}
            </Typography>
          ) : (
            <Link key={crumb.id} component="button" type="button" underline="hover" color="inherit" onClick={() => navigateTo(crumb.id)}>
              {crumb.name}
            </Link>
          ),
        )}
      </Breadcrumbs>

      {/* Search (global) */}
      <TextField
        fullWidth
        size="small"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('home.search_placeholder')}
        sx={{ mb: 2, maxWidth: 640, display: 'block' }}
        slotProps={{
          htmlInput: { 'aria-label': t('home.search_placeholder') },
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
            endAdornment:
              query.length > 0 ? (
                <InputAdornment position="end">
                  <IconButton size="small" edge="end" aria-label={tMenuSearch('clear')} onClick={() => setQuery('')}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
          },
        }}
      />

      {progress ? (
        <Box sx={{ mb: 2, maxWidth: 640 }} role="status">
          <Typography variant="body2" sx={{ mb: 0.5 }}>
            {t('upload.in_progress', { done: progress.done, total: progress.total })}
          </Typography>
          <LinearProgress variant="determinate" value={Math.round(progress.fraction * 100)} />
        </Box>
      ) : null}

      {folderMissing ? <Alert severity="warning" sx={{ mb: 2 }}>{t('access.no_access')}</Alert> : null}

      {/* Listing */}
      {trimmedQuery !== '' ? (
        searchHits.length === 0 ? (
          <Typography color="text.secondary">{t('search.empty')}</Typography>
        ) : (
          <Paper variant="outlined">
            <List disablePadding>
              {searchHits.map((hit) => {
                const path = t('search.result_path', { path: pathLabel(rootLabel, separator, folderPath(pruned.folders, hit.parentId)) });
                return hit.kind === 'folder' ? renderFolderRow(hit.folder, path) : renderFileRow(hit.file, path);
              })}
            </List>
          </Paper>
        )
      ) : listing.folders.length === 0 && listing.files.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <FolderIcon color="disabled" sx={{ fontSize: 48, mb: 1 }} />
          <Typography variant="h6">{folderId === null ? t('home.empty_title') : t('folder.empty_title')}</Typography>
          {folderId === null && showEmptyMessage ? <Typography color="text.secondary">{t('home.empty_message')}</Typography> : null}
        </Box>
      ) : viewMode === 'grid' ? (
        renderGrid(listing.folders, listing.files)
      ) : (
        <Paper variant="outlined">
          <List disablePadding>
            {listing.folders.map((folder) => renderFolderRow(folder, folderSecondary(folder)))}
            {listing.files.map((file) => renderFileRow(file, fileSecondary(file)))}
          </List>
        </Paper>
      )}

      {/* Kebab menu — permission-hidden entries (ADR-038) */}
      <Menu open={menu !== null} anchorEl={menu?.anchor ?? null} onClose={() => closeMenu()}>
        {menuFile
          ? [
              <MenuItem key="open" onClick={() => closeMenu(() => openFile(menuFile))}>
                {t('action.open')}
              </MenuItem>,
              <MenuItem
                key="drive"
                component="a"
                href={driveViewUrl(menuFile.drive_file_id)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => closeMenu()}
              >
                {t('action.open_in_drive')}
              </MenuItem>,
              <MenuItem
                key="download"
                component="a"
                href={driveDownloadUrl(menuFile.drive_file_id)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => closeMenu()}
              >
                {t('action.download')}
              </MenuItem>,
              <MenuItem key="copy" onClick={() => closeMenu(() => void copyLink(menuFile))}>
                {t('action.copy_link')}
              </MenuItem>,
              ...(canDelete
                ? [
                    <MenuItem key="delete" onClick={() => closeMenu(() => setDeleteFileTarget(menuFile))}>
                      {t('action.delete_file')}
                    </MenuItem>,
                  ]
                : []),
            ]
          : menuFolder
            ? [
                ...(canManageFolders
                  ? [
                      <MenuItem key="rename" onClick={() => closeMenu(() => setRenameTarget(menuFolder))}>
                        {t('action.rename_folder')}
                      </MenuItem>,
                    ]
                  : []),
                ...(isOwner
                  ? [
                      <MenuItem key="access" onClick={() => closeMenu(() => setAccessTarget(menuFolder))}>
                        {t('action.manage_access')}
                      </MenuItem>,
                    ]
                  : []),
                ...(canDelete
                  ? [
                      <MenuItem key="delete" onClick={() => closeMenu(() => setDeleteFolderTarget(menuFolder))}>
                        {t('action.delete_folder')}
                      </MenuItem>,
                    ]
                  : []),
              ]
            : null}
      </Menu>

      {/* Dialogs */}
      <FolderNameDialog
        open={newFolderOpen}
        mode="create"
        siblings={listing.folders}
        onClose={() => setNewFolderOpen(false)}
        onSubmit={handleCreateFolder}
      />
      <FolderNameDialog
        open={renameTarget !== null}
        mode="rename"
        initialName={renameTarget?.name}
        siblings={renameTarget ? listFolder(pruned.folders, pruned.files, renameTarget.parent_id).folders : []}
        selfId={renameTarget?.id ?? null}
        onClose={() => setRenameTarget(null)}
        onSubmit={handleRenameFolder}
      />

      <Dialog open={deleteFolderTarget !== null} onClose={() => setDeleteFolderTarget(null)}>
        <DialogTitle>{t('folder.delete_confirm_title')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {(() => {
              const count = deleteFolderTarget ? descendantCount(pruned.folders, pruned.files, deleteFolderTarget.id) : 0;
              return count === 0 ? t('folder.delete_confirm_message_empty') : t('folder.delete_confirm_message', { count });
            })()}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteFolderTarget(null)}>{tCommon('action.cancel')}</Button>
          <Button color="error" variant="contained" onClick={() => void handleDeleteFolder()}>
            {tCommon('action.delete')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteFileTarget !== null} onClose={() => setDeleteFileTarget(null)}>
        <DialogTitle>{t('file.delete_confirm_title')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('file.delete_confirm_message')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteFileTarget(null)}>{tCommon('action.cancel')}</Button>
          <Button color="error" variant="contained" onClick={() => void handleDeleteFile()}>
            {tCommon('action.delete')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={pendingUpload !== null} onClose={() => setPendingUpload(null)}>
        <DialogTitle>{t('upload.link_google_title')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('upload.link_google_message')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingUpload(null)}>{t('upload.link_google_later')}</Button>
          <Button variant="contained" onClick={() => void connectAndUpload()}>
            {t('upload.link_google_connect')}
          </Button>
        </DialogActions>
      </Dialog>

      {isOwner && userId ? (
        <FolderAccessDialog
          db={supabase}
          folder={accessTarget}
          userId={userId}
          onClose={() => setAccessTarget(null)}
          onSaved={(next) => {
            setIndex((prev) => ({ ...prev, folders: prev.folders.map((f) => (f.id === next.id ? next : f)) }));
            setSnack(t('access.saved'));
          }}
        />
      ) : null}

      <FileLightbox file={lightbox} onClose={() => setLightbox(null)} />

      <Snackbar open={snack !== null} autoHideDuration={4000} onClose={() => setSnack(null)} message={snack ?? ''} />
    </Box>
  );
}
