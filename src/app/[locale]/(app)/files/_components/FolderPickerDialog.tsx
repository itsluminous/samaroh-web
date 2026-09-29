'use client';

/**
 * Destination-folder picker (owner feedback 2026-09-29, design D18 parity
 * with Android's "Save to Files" folder picker): shown when an upload starts
 * from a NON-folder context on web — the global search results — where the
 * current route folder is not what the user is looking at. Lists the whole
 * reachable tree (root row + every folder, indented, A–Z per level) with the
 * current route folder preselected; confirm uploads there.
 *
 * "New folder" (permission-HIDDEN, never greyed — `files.manage_folders`,
 * plus the client depth cap) opens the shared FolderNameDialog for a child of
 * the selected folder, then SELECTS the freshly created folder so the very
 * next tap uploads into it.
 */
import CreateNewFolderOutlinedIcon from '@mui/icons-material/CreateNewFolderOutlined';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { flattenFolderTree, FOLDER_DEPTH_MAX, folderDepth, folderPath, listFolder, pathLabel } from '../_lib/tree';
import type { FolderRecord } from '../_lib/types';
import FolderNameDialog from './FolderNameDialog';

export default function FolderPickerDialog({
  open,
  folders,
  initialFolderId,
  canCreateFolder,
  onCreateFolder,
  onClose,
  onConfirm,
}: {
  open: boolean;
  /** Reachable (pruned) folders — the same map the screen lists from. */
  folders: Map<string, FolderRecord>;
  /** Preselected destination (null = top level). */
  initialFolderId: string | null;
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
  const [newFolderOpen, setNewFolderOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(initialFolderId);
      setNewFolderOpen(false);
    }
  }, [open, initialFolderId]);

  // A selection that vanished (deleted elsewhere) falls back to the top level.
  const selectedId = selected !== null && folders.has(selected) ? selected : null;
  const rows = useMemo(() => flattenFolderTree(folders), [folders]);
  const rootLabel = t('home.root_label');
  const selectedPath = pathLabel(rootLabel, t('breadcrumb.separator'), folderPath(folders, selectedId));
  const canCreateHere = canCreateFolder && folderDepth(folders, selectedId) < FOLDER_DEPTH_MAX;
  const siblings = listFolder(folders, [], selectedId).folders;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('share_target.pick_folder_title')}</DialogTitle>
      <DialogContent sx={{ px: 0 }}>
        <List dense disablePadding role="listbox" aria-label={t('share_target.pick_folder_title')} sx={{ maxHeight: '50vh', overflowY: 'auto' }}>
          <ListItemButton role="option" selected={selectedId === null} aria-selected={selectedId === null} onClick={() => setSelected(null)}>
            <ListItemIcon>
              <FolderOpenIcon color="primary" />
            </ListItemIcon>
            <ListItemText primary={rootLabel} />
          </ListItemButton>
          {rows.map(({ folder, depth }) => (
            <ListItemButton
              key={folder.id}
              role="option"
              selected={selectedId === folder.id}
              aria-selected={selectedId === folder.id}
              onClick={() => setSelected(folder.id)}
              sx={{ pl: 2 + (depth + 1) * 2 }}
            >
              <ListItemIcon>
                <FolderIcon color={selectedId === folder.id ? 'primary' : 'action'} />
              </ListItemIcon>
              <ListItemText primary={folder.name} primaryTypographyProps={{ noWrap: true }} />
            </ListItemButton>
          ))}
        </List>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 3, pt: 1 }} noWrap>
          {t('picker.selected_hint', { path: selectedPath })}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {canCreateHere ? (
          <Button startIcon={<CreateNewFolderOutlinedIcon />} onClick={() => setNewFolderOpen(true)} sx={{ mr: 'auto' }}>
            {t('action.new_folder')}
          </Button>
        ) : null}
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button onClick={onClose}>{tCommon('action.cancel')}</Button>
          <Button variant="contained" onClick={() => onConfirm(selectedId)}>
            {t('picker.confirm')}
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
          setSelected(created.id);
        }}
      />
    </Dialog>
  );
}
