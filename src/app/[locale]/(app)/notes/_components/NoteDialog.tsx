'use client';

// Note popup (Keep-style): VIEW mode shows the note with its actions —
// Pin/Unpin, Edit, Share (Web Share API with clipboard fallback),
// Complete/un-complete, Delete→Trash, Restore, Delete forever (Trash only) —
// and EDIT mode edits title, body or checklist (add/toggle/remove),
// color (ColorSwatchPicker reuse) and tags (type-ahead with create-on-the-fly).
// Members without notes.edit get a view-only popup (Share stays available).

import CloseIcon from '@mui/icons-material/Close';
import DeleteForeverOutlinedIcon from '@mui/icons-material/DeleteForeverOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import RestoreIcon from '@mui/icons-material/Restore';
import ShareOutlinedIcon from '@mui/icons-material/ShareOutlined';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import UndoIcon from '@mui/icons-material/Undo';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import ColorSwatchPicker from '@/components/ColorSwatchPicker';
import { findBookingColor } from '@/lib/booking/bookingColors';
import type { NoteInput } from '../_lib/queries';
import {
  addChecklistItem,
  noteShareText,
  removeChecklistItem,
  toggleChecklistItem,
} from '../_lib/notesView';
import type { ChecklistItem, NoteRecord, NoteTagRecord } from '../_lib/types';

export default function NoteDialog({
  note,
  tags,
  noteTagIds,
  canEdit,
  canDelete,
  startInEdit,
  onSaveContent,
  onSaveTags,
  onCreateTag,
  onTogglePin,
  onSetStatus,
  onPurge,
  onShared,
  onClose,
}: {
  note: NoteRecord;
  /** All live tags of the business (type-ahead options). */
  tags: NoteTagRecord[];
  /** The note's current live tag ids. */
  noteTagIds: string[];
  canEdit: boolean;
  /** notes.delete — shows "Delete forever" in Trash. */
  canDelete: boolean;
  /** Open straight into edit mode (create flow). */
  startInEdit: boolean;
  onSaveContent: (input: NoteInput) => Promise<void>;
  onSaveTags: (tagIds: string[]) => Promise<void>;
  /** Create-on-the-fly from the type-ahead; resolves the created tag. */
  onCreateTag: (name: string) => Promise<NoteTagRecord>;
  onTogglePin: () => Promise<void>;
  onSetStatus: (status: 'active' | 'completed' | 'trashed') => Promise<void>;
  onPurge: () => Promise<void>;
  /** Clipboard-fallback notice hook (Web Share API unavailable). */
  onShared: (viaClipboard: boolean) => void;
  onClose: () => void;
}) {
  const t = useTranslations('notes');
  const tCommon = useTranslations('common');

  const [editing, setEditing] = useState(startInEdit && canEdit);
  const [title, setTitle] = useState(note.title ?? '');
  const [content, setContent] = useState(note.content ?? '');
  const [checklist, setChecklist] = useState<ChecklistItem[]>(note.checklist);
  const [newItem, setNewItem] = useState('');
  const [color, setColor] = useState<string | null>(note.color);
  const [selectedTags, setSelectedTags] = useState<NoteTagRecord[]>(
    tags.filter((tag) => noteTagIds.includes(tag.id)),
  );
  const [saving, setSaving] = useState(false);

  const surface = findBookingColor(editing ? color : note.color);
  const inTrash = note.status === 'trashed';

  async function handleShare() {
    const text = noteShareText(note);
    const nav = navigator as Navigator & { share?: (data: { text: string }) => Promise<void> };
    if (typeof nav.share === 'function') {
      try {
        await nav.share({ text });
        onShared(false);
        return;
      } catch {
        // Cancelled or unsupported payload — fall through to the clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      onShared(true);
    } catch {
      // Clipboard unavailable (permissions) — nothing further to fall back to.
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const pendingItem = newItem.trim();
      const items = pendingItem === '' ? checklist : addChecklistItem(checklist, pendingItem);
      await onSaveContent({
        kind: note.kind,
        title: title.trim() === '' ? null : title.trim(),
        content: note.kind === 'note' ? (content.trim() === '' ? null : content) : null,
        checklist: note.kind === 'checklist' ? items : [],
        color,
        pinned: note.pinned,
      });
      await onSaveTags(selectedTags.map((tag) => tag.id));
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function pickTags(next: (NoteTagRecord | string)[]) {
    // freeSolo values are strings — create the tag on the fly (case-insensitive
    // reuse of an existing tag instead of a duplicate insert).
    const resolved: NoteTagRecord[] = [];
    for (const entry of next) {
      if (typeof entry !== 'string') {
        resolved.push(entry);
        continue;
      }
      const name = entry.trim();
      if (name === '') {
        continue;
      }
      const existing = tags.find((tag) => tag.name.toLowerCase() === name.toLowerCase());
      resolved.push(existing ?? (await onCreateTag(name)));
    }
    // De-dupe by id (typing an existing selection again).
    setSelectedTags([...new Map(resolved.map((tag) => [tag.id, tag])).values()]);
  }

  const viewChecklist = (
    <Box>
      {note.checklist.map((item) => (
        <Box key={item.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Checkbox
            size="small"
            checked={item.done}
            disabled={!canEdit || inTrash}
            inputProps={{ 'aria-label': item.text }}
            sx={{ p: 0.25 }}
            onChange={() =>
              void onSaveContent({
                kind: note.kind,
                title: note.title,
                content: note.content,
                checklist: toggleChecklistItem(note.checklist, item.id),
                color: note.color,
                pinned: note.pinned,
              })
            }
          />
          <Typography
            sx={{
              textDecoration: item.done ? 'line-through' : 'none',
              opacity: item.done ? 0.6 : 1,
              overflowWrap: 'anywhere',
            }}
          >
            {item.text}
          </Typography>
        </Box>
      ))}
    </Box>
  );

  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{ sx: { bgcolor: surface?.hex, color: surface?.on_hex } }}
    >
      <DialogContent>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            {editing ? (
              <TextField
                fullWidth
                variant="standard"
                label={t('editor.title_placeholder')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            ) : note.title ? (
              <Typography variant="h6" sx={{ overflowWrap: 'anywhere' }}>
                {note.title}
              </Typography>
            ) : null}
          </Box>
          {!editing && canEdit && !inTrash ? (
            <Tooltip title={note.pinned ? t('action.unpin') : t('action.pin')}>
              <IconButton
                aria-label={note.pinned ? t('action.unpin') : t('action.pin')}
                sx={{ color: 'inherit' }}
                onClick={() => void onTogglePin()}
              >
                {note.pinned ? <PushPinIcon /> : <PushPinOutlinedIcon />}
              </IconButton>
            </Tooltip>
          ) : null}
          <Tooltip title={tCommon('action.close')}>
            <IconButton aria-label={tCommon('action.close')} sx={{ color: 'inherit' }} onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </Tooltip>
        </Box>

        <Stack spacing={2} sx={{ mt: 1 }}>
          {note.kind === 'note' ? (
            editing ? (
              <TextField
                fullWidth
                multiline
                minRows={3}
                variant="standard"
                label={t('editor.content_placeholder')}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            ) : note.content ? (
              <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{note.content}</Typography>
            ) : null
          ) : editing ? (
            <Box>
              {checklist.map((item) => (
                <Box key={item.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Checkbox
                    size="small"
                    checked={item.done}
                    inputProps={{ 'aria-label': item.text }}
                    sx={{ p: 0.25 }}
                    onChange={() => setChecklist(toggleChecklistItem(checklist, item.id))}
                  />
                  <Typography sx={{ flexGrow: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{item.text}</Typography>
                  <IconButton
                    size="small"
                    aria-label={t('editor.checklist_remove')}
                    sx={{ color: 'inherit' }}
                    onClick={() => setChecklist(removeChecklistItem(checklist, item.id))}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
              <TextField
                fullWidth
                variant="standard"
                label={t('editor.checklist_add')}
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    setChecklist(addChecklistItem(checklist, newItem));
                    setNewItem('');
                  }
                }}
              />
            </Box>
          ) : (
            viewChecklist
          )}

          {editing ? (
            <>
              <Box>
                <Typography variant="caption" component="div" sx={{ mb: 0.5, opacity: 0.8 }}>
                  {t('picker.color_title')}
                </Typography>
                <ColorSwatchPicker label={t('picker.color_title')} value={color} onChange={setColor} />
              </Box>
              <Autocomplete
                multiple
                freeSolo
                options={tags}
                value={selectedTags}
                getOptionLabel={(option) => (typeof option === 'string' ? option : option.name)}
                isOptionEqualToValue={(option, val) => option.id === val.id}
                onChange={(_e, next) => void pickTags(next)}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => {
                    const { key, ...chipProps } = getTagProps({ index });
                    const label = typeof option === 'string' ? option : option.name;
                    return <Chip key={key} size="small" label={label} {...chipProps} />;
                  })
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    variant="standard"
                    label={t('picker.tags_title')}
                    placeholder={t('picker.tags_name_placeholder')}
                  />
                )}
              />
            </>
          ) : (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {tags
                .filter((tag) => noteTagIds.includes(tag.id))
                .map((tag) => (
                  <Chip key={tag.id} size="small" variant="outlined" label={tag.name} sx={{ color: 'inherit', borderColor: 'currentColor' }} />
                ))}
            </Box>
          )}

          {inTrash ? <Alert severity="info">{t('trash.notice')}</Alert> : null}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ flexWrap: 'wrap', gap: 0.5 }}>
        {editing ? (
          <>
            <Button sx={{ color: 'inherit' }} onClick={() => (startInEdit ? onClose() : setEditing(false))}>
              {tCommon('action.cancel')}
            </Button>
            <Button variant="contained" disabled={saving} onClick={() => void handleSave()}>
              {tCommon('action.save')}
            </Button>
          </>
        ) : (
          <>
            <Tooltip title={t('action.share')}>
              <IconButton aria-label={t('action.share')} sx={{ color: 'inherit' }} onClick={() => void handleShare()}>
                <ShareOutlinedIcon />
              </IconButton>
            </Tooltip>
            {canEdit && !inTrash ? (
              <Tooltip title={t('action.edit')}>
                <IconButton aria-label={t('action.edit')} sx={{ color: 'inherit' }} onClick={() => setEditing(true)}>
                  <EditOutlinedIcon />
                </IconButton>
              </Tooltip>
            ) : null}
            {canEdit && note.status === 'active' ? (
              <Tooltip title={t('action.complete')}>
                <IconButton aria-label={t('action.complete')} sx={{ color: 'inherit' }} onClick={() => void onSetStatus('completed')}>
                  <TaskAltIcon />
                </IconButton>
              </Tooltip>
            ) : null}
            {canEdit && note.status === 'completed' ? (
              <Tooltip title={t('action.uncomplete')}>
                <IconButton aria-label={t('action.uncomplete')} sx={{ color: 'inherit' }} onClick={() => void onSetStatus('active')}>
                  <UndoIcon />
                </IconButton>
              </Tooltip>
            ) : null}
            {canEdit && inTrash ? (
              <Tooltip title={t('action.restore')}>
                <IconButton aria-label={t('action.restore')} sx={{ color: 'inherit' }} onClick={() => void onSetStatus('active')}>
                  <RestoreIcon />
                </IconButton>
              </Tooltip>
            ) : null}
            {canEdit && !inTrash ? (
              <Tooltip title={t('action.delete')}>
                <IconButton aria-label={t('action.delete')} sx={{ color: 'inherit' }} onClick={() => void onSetStatus('trashed')}>
                  <DeleteOutlineIcon />
                </IconButton>
              </Tooltip>
            ) : null}
            {canDelete && inTrash ? (
              <Tooltip title={t('action.delete_forever')}>
                <IconButton aria-label={t('action.delete_forever')} sx={{ color: 'inherit' }} onClick={() => void onPurge()}>
                  <DeleteForeverOutlinedIcon />
                </IconButton>
              </Tooltip>
            ) : null}
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
