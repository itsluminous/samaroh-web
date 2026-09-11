'use client';

// Note popup (Keep-style): VIEW mode shows the note with its actions —
// Pin/Unpin, Edit, Share (Web Share API with clipboard fallback),
// Complete/un-complete, Delete→Trash, Restore, Delete forever (Trash only) —
// and EDIT mode edits title, body or checklist, color (compact
// ColorSwatchPicker row) and tags (debounced type-ahead: suggestions only
// while typing, with a create-on-the-fly option; selected tags are removable
// chips). Checklist items are NON-editable once added: rows are checkbox +
// plain text + remove cross with a single Add-item field at the bottom, and
// reordering is the pointer-events whole-row drag in ChecklistEditor
// (long-press on touch, press-and-move with mouse — HTML5 dnd was removed
// because it never fires on touch browsers). The pin toggle is available
// in BOTH modes (ADR-077 parity): immediate in view mode, buffered into the
// save payload while editing — so a note can be pinned during create.
// Closing a brand-new note without content
// discards it (onDiscard) so empty cards never linger in the grid.
// Members without notes.edit get a view-only popup (Share stays available).

import CancelIcon from '@mui/icons-material/Cancel';
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
import { useEffect, useMemo, useState } from 'react';
import ColorSwatchPicker from '@/components/ColorSwatchPicker';
import { findBookingColor } from '@/lib/booking/bookingColors';
import type { NoteInput } from '../_lib/queries';
import {
  addChecklistItem,
  isNoteContentEmpty,
  noteShareText,
} from '../_lib/notesView';
import type { ChecklistItem, NoteRecord, NoteTagRecord } from '../_lib/types';
import ChecklistEditor from './ChecklistEditor';

/** Debounce before the tag type-ahead surfaces suggestions. */
export const TAG_SUGGEST_DEBOUNCE_MS = 200;
/** Sentinel id of the type-ahead's create-on-the-fly option. */
const CREATE_TAG_OPTION_ID = '__create-tag__';

export default function NoteDialog({
  note,
  tags,
  noteTagIds,
  canEdit,
  canDelete,
  canToggle,
  startInEdit,
  onSaveContent,
  onSaveTags,
  onCreateTag,
  onTogglePin,
  onToggleItem,
  onSetStatus,
  onPurge,
  onShared,
  onClose,
  onDiscard,
}: {
  note: NoteRecord;
  /** All live tags of the business (type-ahead options). */
  tags: NoteTagRecord[];
  /** The note's current live tag ids. */
  noteTagIds: string[];
  canEdit: boolean;
  /** notes.delete — shows "Delete forever" in Trash. */
  canDelete: boolean;
  /**
   * notes.edit OR notes.toggle_checklist (shared migration 007) — enables
   * the view-mode checklist done-toggles for members without full edit.
   */
  canToggle: boolean;
  /** Open straight into edit mode (create flow). */
  startInEdit: boolean;
  onSaveContent: (input: NoteInput) => Promise<void>;
  onSaveTags: (tagIds: string[]) => Promise<void>;
  /** Create-on-the-fly from the type-ahead; resolves the created tag. */
  onCreateTag: (name: string) => Promise<NoteTagRecord>;
  onTogglePin: () => Promise<void>;
  /**
   * View-mode done-flag toggle. Must push a toggle-only patch (checklist +
   * updated_by) — the migration-007 guard rejects anything wider from
   * members holding only toggle_checklist.
   */
  onToggleItem: (itemId: string) => Promise<void>;
  onSetStatus: (status: 'active' | 'completed' | 'trashed') => Promise<void>;
  onPurge: () => Promise<void>;
  /** Clipboard-fallback notice hook (Web Share API unavailable). */
  onShared: (viaClipboard: boolean) => void;
  onClose: () => void;
  /**
   * Create flow only: called instead of onClose when the brand-new note is
   * closed without content, so the caller can drop the empty row. Falls
   * back to onClose when absent.
   */
  onDiscard?: () => Promise<void>;
}) {
  const t = useTranslations('notes');
  const tCommon = useTranslations('common');

  const [editing, setEditing] = useState(startInEdit && canEdit);
  const [title, setTitle] = useState(note.title ?? '');
  const [content, setContent] = useState(note.content ?? '');
  const [checklist, setChecklist] = useState<ChecklistItem[]>(note.checklist);
  const [newItem, setNewItem] = useState('');
  const [color, setColor] = useState<string | null>(note.color);
  // Buffered pin (ADR-077 parity): edit/create toggles this local flag and it
  // lands in the save payload; view mode bypasses it via onTogglePin.
  const [pinned, setPinned] = useState(note.pinned);
  const [selectedTags, setSelectedTags] = useState<NoteTagRecord[]>(
    tags.filter((tag) => noteTagIds.includes(tag.id)),
  );
  const [saving, setSaving] = useState(false);

  // Tag type-ahead: suggestions appear only while typing, after a debounce.
  const [tagInput, setTagInput] = useState('');
  const [tagQuery, setTagQuery] = useState('');
  const [tagFocused, setTagFocused] = useState(false);
  useEffect(() => {
    const handle = setTimeout(() => setTagQuery(tagInput.trim()), TAG_SUGGEST_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [tagInput]);

  // Matching live tags + a create-on-the-fly option when the typed name is
  // not an exact (case-insensitive) existing tag.
  const tagOptions = useMemo<NoteTagRecord[]>(() => {
    const q = tagQuery.toLowerCase();
    if (q === '') {
      return [];
    }
    const matches = tags.filter((tag) => tag.name.toLowerCase().includes(q));
    if (tags.some((tag) => tag.name.toLowerCase() === q)) {
      return matches;
    }
    return [
      ...matches,
      {
        id: CREATE_TAG_OPTION_ID,
        business_id: note.business_id,
        name: tagQuery,
        created_at: '',
        updated_at: '',
        deleted_at: null,
      },
    ];
  }, [tags, tagQuery, note.business_id]);

  const tagsOpen = tagFocused && tagInput.trim() !== '' && tagQuery !== '';

  const surface = findBookingColor(editing ? color : note.color);
  const inTrash = note.status === 'trashed';

  /** Create flow: drop the (still empty) row instead of leaving a phantom card. */
  async function handleDiscard() {
    if (onDiscard) {
      await onDiscard();
      return;
    }
    onClose();
  }

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
      const input: NoteInput = {
        kind: note.kind,
        title: title.trim() === '' ? null : title.trim(),
        content: note.kind === 'note' ? (content.trim() === '' ? null : content) : null,
        checklist: note.kind === 'checklist' ? items : [],
        color,
        pinned,
      };
      // Saving a brand-new note with no content at all = discard (Keep-style).
      if (startInEdit && selectedTags.length === 0 && isNoteContentEmpty(input)) {
        await handleDiscard();
        return;
      }
      await onSaveContent(input);
      await onSaveTags(selectedTags.map((tag) => tag.id));
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function pickTags(next: (NoteTagRecord | string)[]) {
    // freeSolo Enter yields strings; the create-option sentinel yields a
    // placeholder record — both create the tag on the fly (case-insensitive
    // reuse of an existing tag instead of a duplicate insert).
    const resolved: NoteTagRecord[] = [];
    for (const entry of next) {
      if (typeof entry !== 'string' && entry.id !== CREATE_TAG_OPTION_ID) {
        resolved.push(entry);
        continue;
      }
      const name = (typeof entry === 'string' ? entry : entry.name).trim();
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
            disabled={!canToggle || inTrash}
            inputProps={{ 'aria-label': item.text }}
            sx={{ p: 0.25 }}
            onChange={() => void onToggleItem(item.id)}
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

  // Backdrop/Escape on a create closes through the discard path — the row
  // in the store is still empty, so leaving it would show a phantom card.
  const handleDialogClose = () => {
    if (startInEdit && editing) {
      void handleDiscard();
      return;
    }
    onClose();
  };

  return (
    <Dialog
      open
      onClose={handleDialogClose}
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
          {canEdit && !inTrash ? (
            // Edit/create: buffered toggle saved with the content. View:
            // immediate persist through onTogglePin (unchanged behavior).
            editing ? (
              <Tooltip title={pinned ? t('action.unpin') : t('action.pin')}>
                <IconButton
                  aria-label={pinned ? t('action.unpin') : t('action.pin')}
                  sx={{ color: 'inherit' }}
                  onClick={() => setPinned(!pinned)}
                >
                  {pinned ? <PushPinIcon /> : <PushPinOutlinedIcon />}
                </IconButton>
              </Tooltip>
            ) : (
              <Tooltip title={note.pinned ? t('action.unpin') : t('action.pin')}>
                <IconButton
                  aria-label={note.pinned ? t('action.unpin') : t('action.pin')}
                  sx={{ color: 'inherit' }}
                  onClick={() => void onTogglePin()}
                >
                  {note.pinned ? <PushPinIcon /> : <PushPinOutlinedIcon />}
                </IconButton>
              </Tooltip>
            )
          ) : null}
          <Tooltip title={tCommon('action.close')}>
            <IconButton aria-label={tCommon('action.close')} sx={{ color: 'inherit' }} onClick={handleDialogClose}>
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
                minRows={6}
                variant="standard"
                label={t('editor.content_placeholder')}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            ) : note.content ? (
              <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{note.content}</Typography>
            ) : null
          ) : editing ? (
            <ChecklistEditor
              items={checklist}
              onItemsChange={setChecklist}
              pendingText={newItem}
              onPendingTextChange={setNewItem}
              surfaceColor={surface?.hex}
            />
          ) : (
            viewChecklist
          )}

          {editing ? (
            <>
              <Box>
                <Typography variant="caption" component="div" sx={{ mb: 0.5, opacity: 0.8 }}>
                  {t('picker.color_title')}
                </Typography>
                <ColorSwatchPicker label={t('picker.color_title')} value={color} onChange={setColor} compact />
              </Box>
              <Autocomplete
                multiple
                freeSolo
                open={tagsOpen}
                options={tagOptions}
                filterOptions={(x) => x}
                value={selectedTags}
                inputValue={tagInput}
                onInputChange={(_e, next) => setTagInput(next)}
                getOptionLabel={(option) => (typeof option === 'string' ? option : option.name)}
                isOptionEqualToValue={(option, val) => option.id === val.id}
                onChange={(_e, next) => void pickTags(next)}
                renderOption={(props, option) => {
                  const { key, ...optionProps } = props;
                  return (
                    <li key={key} {...optionProps}>
                      {option.id === CREATE_TAG_OPTION_ID
                        ? t('picker.tags_create', { name: option.name })
                        : option.name}
                    </li>
                  );
                }}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => {
                    const { key, ...chipProps } = getTagProps({ index });
                    const label = typeof option === 'string' ? option : option.name;
                    return (
                      <Chip
                        key={key}
                        size="small"
                        label={label}
                        {...chipProps}
                        deleteIcon={<CancelIcon aria-label={t('picker.tags_remove', { name: label })} />}
                      />
                    );
                  })
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    variant="standard"
                    label={t('picker.tags_title')}
                    placeholder={t('picker.tags_name_placeholder')}
                    onFocus={() => setTagFocused(true)}
                    onBlur={() => setTagFocused(false)}
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
            <Button sx={{ color: 'inherit' }} onClick={() => (startInEdit ? void handleDiscard() : setEditing(false))}>
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
                <IconButton
                  aria-label={t('action.edit')}
                  sx={{ color: 'inherit' }}
                  onClick={() => {
                    setPinned(note.pinned); // resync the buffer on re-entry
                    setEditing(true);
                  }}
                >
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
