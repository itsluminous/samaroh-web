'use client';

// Manage-tags popup (opened from the notes drawer's Tags header): rename a
// tag inline — with duplicate-name validation against the business's other
// live tags — or delete it behind a confirmation that states how many notes
// currently carry the tag (delete tombstones the tag AND its live links).

import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { NoteTagRecord } from '../_lib/types';

export default function ManageTagsDialog({
  tags,
  linkedNoteCount,
  onRename,
  onDelete,
  onClose,
}: {
  /** The business's live tags. */
  tags: NoteTagRecord[];
  /** Live notes currently carrying the tag — quoted in the delete confirmation. */
  linkedNoteCount: (tagId: string) => number;
  onRename: (tag: NoteTagRecord, name: string) => Promise<void>;
  /** Tombstones the tag and its live links. */
  onDelete: (tag: NoteTagRecord) => Promise<void>;
  onClose: () => void;
}) {
  const t = useTranslations('notes');
  const tCommon = useTranslations('common');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [confirming, setConfirming] = useState<NoteTagRecord | null>(null);
  const [busy, setBusy] = useState(false);

  const trimmed = editValue.trim();
  const isDuplicate =
    editingId !== null &&
    tags.some((tag) => tag.id !== editingId && tag.name.toLowerCase() === trimmed.toLowerCase());

  function startEdit(tag: NoteTagRecord) {
    setEditingId(tag.id);
    setEditValue(tag.name);
  }

  async function commitRename(tag: NoteTagRecord) {
    if (trimmed === '' || isDuplicate) {
      return;
    }
    if (trimmed === tag.name) {
      setEditingId(null);
      return;
    }
    setBusy(true);
    try {
      await onRename(tag, trimmed);
      setEditingId(null);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!confirming) {
      return;
    }
    setBusy(true);
    try {
      await onDelete(confirming);
      setConfirming(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('tags.manage_title')}</DialogTitle>
      <DialogContent>
        <List dense>
          {tags.map((tag) => (
            <ListItem key={tag.id} disableGutters>
              {editingId === tag.id ? (
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, width: '100%' }}>
                  <TextField
                    fullWidth
                    size="small"
                    autoFocus
                    label={t('picker.tags_name_placeholder')}
                    value={editValue}
                    error={isDuplicate}
                    helperText={isDuplicate ? t('tags.rename_duplicate') : undefined}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void commitRename(tag);
                      }
                    }}
                  />
                  <Tooltip title={tCommon('action.save')}>
                    <span>
                      <IconButton
                        aria-label={tCommon('action.save')}
                        disabled={busy || trimmed === '' || isDuplicate}
                        onClick={() => void commitRename(tag)}
                      >
                        <CheckIcon />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title={tCommon('action.cancel')}>
                    <IconButton aria-label={tCommon('action.cancel')} onClick={() => setEditingId(null)}>
                      <CloseIcon />
                    </IconButton>
                  </Tooltip>
                </Box>
              ) : (
                <>
                  <ListItemIcon>
                    <LabelOutlinedIcon />
                  </ListItemIcon>
                  <ListItemText primary={tag.name} primaryTypographyProps={{ noWrap: true }} />
                  <Tooltip title={t('tags.rename')}>
                    <IconButton aria-label={t('tags.rename')} size="small" onClick={() => startEdit(tag)}>
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('tags.delete')}>
                    <IconButton aria-label={t('tags.delete')} size="small" onClick={() => setConfirming(tag)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              )}
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tCommon('action.close')}</Button>
      </DialogActions>

      {/* Delete confirmation — states the linked-note count before the cascade. */}
      <Dialog open={confirming !== null} onClose={() => setConfirming(null)}>
        <DialogTitle>{confirming ? t('tags.delete_title', { name: confirming.name }) : null}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('tags.delete_message', {
              count: confirming ? linkedNoteCount(confirming.id) : 0,
            })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(null)}>{tCommon('action.cancel')}</Button>
          <Button color="error" disabled={busy} onClick={() => void confirmDelete()}>
            {t('tags.delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
