'use client';

/**
 * Destination-folder picker (owner feedback 2026-09-29 + 2026-09-30, design
 * D18 parity with Android's "Save to Files" folder picker).
 *
 * Two uses, same dialog:
 * - `mode="upload"` — an upload started from a NON-folder context on web (the
 *   global search results): "Save where?" → "Upload here".
 * - `mode="move"` — the kebab's "Move to…" action: "Move where?" → "Move";
 *   the moved folder's own subtree is HIDDEN from the list (it
 *   can never be its own destination) and `validateTarget` runs on confirm
 *   (cycle / depth cap / duplicate name / same place → inline error).
 *
 * LAZY TREE (2026-09-30 item 2): the list opens with the top-level row and
 * the ROOT folders only; a row with subfolders carries an expand chevron
 * that reveals its children indented one level deeper (and so on). The
 * ancestors of the preselected folder start expanded so the selection is
 * visible. The root row is selectable.
 *
 * SIZING (item 3): near full width on a phone viewport, body-size text,
 * compact rows (`compactDialogProps`).
 *
 * "New folder" (permission-HIDDEN, never greyed — `files.manage_folders`,
 * plus the client depth cap) opens the shared FolderNameDialog for a child of
 * the selected folder, then SELECTS the freshly created folder.
 */
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CreateNewFolderOutlinedIcon from '@mui/icons-material/CreateNewFolderOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { compactDialogProps } from '../_lib/dialogSx';
import {
  ancestorIds,
  FOLDER_DEPTH_MAX,
  folderDepth,
  folderPath,
  lazyFolderTreeRows,
  listFolder,
  type MoveError,
  pathLabel,
} from '../_lib/tree';
import type { FolderRecord } from '../_lib/types';
import FolderNameDialog from './FolderNameDialog';

export type FolderPickerMode = 'upload' | 'move';

export default function FolderPickerDialog({
  open,
  mode = 'upload',
  folders,
  initialFolderId,
  excludeFolderId = null,
  validateTarget,
  canCreateFolder,
  onCreateFolder,
  onClose,
  onConfirm,
}: {
  open: boolean;
  mode?: FolderPickerMode;
  /** Reachable (pruned) folders — the same map the screen lists from. */
  folders: Map<string, FolderRecord>;
  /** Preselected destination (null = top level). */
  initialFolderId: string | null;
  /** Move mode: the folder being moved — it and its subtree are hidden. */
  excludeFolderId?: string | null;
  /** Move mode: runs on confirm; a non-null result is shown inline and blocks the move. */
  validateTarget?: (folderId: string | null) => MoveError | null;
  /** files.manage_folders (inherits upload) — hides the New folder action when false. */
  canCreateFolder: boolean;
  /** Creates a child of `parentId`; the picker selects the returned folder. */
  onCreateFolder: (parentId: string | null, name: string) => Promise<FolderRecord>;
  onClose: () => void;
  /** The chosen destination (null = top level). */
  onConfirm: (folderId: string | null) => void;
}) {
  const t = useTranslations('files');
  const tCommon = useTranslations('common');
  const [selected, setSelected] = useState<string | null>(initialFolderId);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [error, setError] = useState<MoveError | null>(null);

  useEffect(() => {
    if (open) {
      setSelected(initialFolderId);
      setExpanded(ancestorIds(folders, initialFolderId));
      setNewFolderOpen(false);
      setError(null);
    }
    // `folders` is intentionally not a dependency: re-fetches must not reset the user's expansion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFolderId]);

  // A selection that vanished (deleted elsewhere) falls back to the top level.
  const selectedId = selected !== null && folders.has(selected) ? selected : null;
  const rows = useMemo(() => lazyFolderTreeRows(folders, expanded, excludeFolderId), [folders, expanded, excludeFolderId]);
  const rootLabel = t('home.root_label');
  const title = mode === 'move' ? t('move.title') : t('share_target.pick_folder_title');
  const selectedPath = pathLabel(rootLabel, t('breadcrumb.separator'), folderPath(folders, selectedId));
  const canCreateHere = canCreateFolder && folderDepth(folders, selectedId) < FOLDER_DEPTH_MAX;
  const siblings = listFolder(folders, [], selectedId).folders;

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const select = (id: string | null) => {
    setSelected(id);
    setError(null);
  };

  const confirm = () => {
    const problem = validateTarget ? validateTarget(selectedId) : null;
    if (problem) {
      setError(problem);
      return;
    }
    onConfirm(selectedId);
  };

  const rowSx = { minHeight: 40, py: 0.25 } as const;

  return (
    <Dialog open={open} onClose={onClose} {...compactDialogProps}>
      <DialogTitle sx={{ pb: 1 }}>{title}</DialogTitle>
      <DialogContent sx={{ px: 0 }}>
        <List dense disablePadding role="tree" aria-label={title} sx={{ maxHeight: '50vh', overflowY: 'auto' }}>
          <ListItemButton
            role="treeitem"
            aria-level={1}
            selected={selectedId === null}
            aria-selected={selectedId === null}
            onClick={() => select(null)}
            sx={rowSx}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              <FolderOpenIcon color="primary" fontSize="small" />
            </ListItemIcon>
            <ListItemText primary={rootLabel} primaryTypographyProps={{ variant: 'body2', noWrap: true }} />
          </ListItemButton>
          {rows.map(({ folder, depth, hasChildren, expanded: isExpanded }) => (
            <ListItemButton
              key={folder.id}
              role="treeitem"
              aria-level={depth + 2}
              aria-expanded={hasChildren ? isExpanded : undefined}
              selected={selectedId === folder.id}
              aria-selected={selectedId === folder.id}
              onClick={() => select(folder.id)}
              sx={{ ...rowSx, pl: 1 + (depth + 1) * 2 }}
            >
              <Box sx={{ width: 28, display: 'flex', justifyContent: 'center', mr: 0.5 }}>
                {hasChildren ? (
                  <IconButton
                    size="small"
                    edge="start"
                    aria-label={isExpanded ? t('picker.collapse', { name: folder.name }) : t('picker.expand', { name: folder.name })}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggle(folder.id);
                    }}
                    sx={{ p: 0.25 }}
                  >
                    {isExpanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
                  </IconButton>
                ) : null}
              </Box>
              <ListItemIcon sx={{ minWidth: 32 }}>
                <FolderIcon color={selectedId === folder.id ? 'primary' : 'action'} fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={folder.name} primaryTypographyProps={{ variant: 'body2', noWrap: true }} />
            </ListItemButton>
          ))}
        </List>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 2, pt: 1 }} noWrap>
          {mode === 'move' ? t('move.selected_hint', { path: selectedPath }) : t('picker.selected_hint', { path: selectedPath })}
        </Typography>
        {error ? (
          <Typography variant="caption" color="error" role="alert" sx={{ display: 'block', px: 2, pt: 0.5 }}>
            {t(`move.${error}`)}
          </Typography>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1, px: 2 }}>
        {canCreateHere ? (
          <Button startIcon={<CreateNewFolderOutlinedIcon />} onClick={() => setNewFolderOpen(true)} sx={{ mr: 'auto' }}>
            {t('action.new_folder')}
          </Button>
        ) : null}
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button onClick={onClose}>{tCommon('action.cancel')}</Button>
          <Button variant="contained" onClick={confirm}>
            {mode === 'move' ? t('move.confirm') : t('picker.confirm')}
          </Button>
        </Box>
      </DialogActions>

      <FolderNameDialog
        open={newFolderOpen}
        mode="create"
        siblings={siblings}
        onClose={() => setNewFolderOpen(false)}
        onSubmit={async (name) => {
          const created = await onCreateFolder(selectedId, name);
          // Reveal the new child under its (now expanded) parent and select it.
          setExpanded((prev) => (selectedId === null ? prev : new Set(prev).add(selectedId)));
          setSelected(created.id);
          setError(null);
        }}
      />
    </Dialog>
  );
}
