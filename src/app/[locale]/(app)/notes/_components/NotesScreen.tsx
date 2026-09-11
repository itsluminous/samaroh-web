'use client';

// Notes tab home (Keep-style parity): left drawer (Notes / Completed / Trash
// + tags — persistent on desktop, temporary on mobile), top search across
// title/content/checklist/tags, pinned-first responsive card grid, two
// bottom create actions (note / checklist) and the note popup. Writes are
// permission-gated (notes.create / edit / delete); the load-time purge sweep
// tombstones trash older than 30 days for members holding notes.delete.

import AddIcon from '@mui/icons-material/Add';
import ChecklistIcon from '@mui/icons-material/Checklist';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import ResponsiveGlassFab from '@/components/ResponsiveGlassFab';
import { useMembership } from '@/lib/permissions/useMembership';
import {
  createNote,
  createTag,
  deleteTag,
  fetchNotesData,
  purgeNote,
  renameTag,
  setNotePinned,
  setNoteStatus,
  setNoteTags,
  sweepExpiredTrash,
  toggleNoteItemDone,
  updateNote,
  type NoteInput,
} from '../_lib/queries';
import { distributeToColumns, liveTagIdsOf, tagsOf, visibleNotes, type NotesFilter } from '../_lib/notesView';
import type { NoteKind, NoteRecord, NoteTagLinkRecord, NoteTagRecord } from '../_lib/types';
import ManageTagsDialog from './ManageTagsDialog';
import NoteCard from './NoteCard';
import NoteDialog from './NoteDialog';

interface DialogState {
  noteId: string;
  startInEdit: boolean;
}

export default function NotesScreen() {
  const t = useTranslations('notes');
  const tCommon = useTranslations('common');
  const tExpensesError = useTranslations('expenses.error');
  const {
    supabase,
    business,
    userId,
    isOwner,
    permissions,
    loading: businessLoading,
    error: businessError,
  } = useMembership();
  const businessId = business?.id ?? null;
  const canCreate = isOwner || permissions.notes.create;
  const canEdit = isOwner || permissions.notes.edit;
  const canDelete = isOwner || permissions.notes.delete;
  // Checklist split (shared migration 007): visibility and the done-flag
  // toggle have their own keys. Editors keep toggling (edit implies the
  // toggle server-side even when toggle_checklist is explicitly false).
  const canViewChecklists = isOwner || permissions.notes.view_checklists;
  const canToggleChecklist = isOwner || permissions.notes.edit || permissions.notes.toggle_checklist;

  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [tags, setTags] = useState<NoteTagRecord[]>([]);
  const [links, setLinks] = useState<NoteTagLinkRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<NotesFilter>({ view: 'notes' });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [manageTagsOpen, setManageTagsOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [snack, setSnack] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!supabase || !businessId || !userId) {
      return;
    }
    setLoadError(false);
    try {
      const data = await fetchNotesData(supabase, businessId);
      let nextNotes = data.notes;
      // 30-day trash purge, client-side on load (spec): only members allowed
      // to "delete forever" run it. Best effort — a failure never blocks the list.
      if (isOwner || canDelete) {
        try {
          const purged = await sweepExpiredTrash(supabase, nextNotes, userId);
          if (purged.length > 0) {
            const gone = new Set(purged.map((n) => n.id));
            nextNotes = nextNotes.filter((n) => !gone.has(n.id));
          }
        } catch {
          // Sweep is best-effort.
        }
      }
      setNotes(nextNotes);
      setTags(data.tags);
      setLinks(data.links);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [supabase, businessId, userId, isOwner, canDelete]);

  useEffect(() => {
    if (businessLoading) {
      return;
    }
    if (!supabase || !businessId) {
      setLoading(false);
      return;
    }
    void reload();
  }, [businessLoading, supabase, businessId, reload]);

  // Defense-in-depth mirror of the notes_select split (RLS already withholds
  // checklists server-side): without view_checklists, kind='checklist' rows
  // vanish from the grid, search, tag scopes and the manage-tags counts.
  const scopedNotes = useMemo(
    () => (canViewChecklists ? notes : notes.filter((n) => n.kind !== 'checklist')),
    [notes, canViewChecklists],
  );

  const gridNotes = useMemo(
    () => visibleNotes(scopedNotes, tags, links, filter, search),
    [scopedNotes, tags, links, filter, search],
  );

  // Same responsive column count the CSS-columns layout used (xs 2 / sm 3 /
  // lg 4), resolved in JS so we can distribute row-major ourselves.
  const theme = useTheme();
  const smUp = useMediaQuery(theme.breakpoints.up('sm'));
  const lgUp = useMediaQuery(theme.breakpoints.up('lg'));
  const columnCount = lgUp ? 4 : smUp ? 3 : 2;
  const noteColumns = useMemo(
    () => distributeToColumns(gridNotes, columnCount),
    [gridNotes, columnCount],
  );

  const dialogNote = dialog ? (scopedNotes.find((n) => n.id === dialog.noteId) ?? null) : null;

  function patchNoteState(next: NoteRecord) {
    setNotes((prev) => prev.map((n) => (n.id === next.id ? next : n)));
  }

  async function handleCreate(kind: NoteKind) {
    if (!supabase || !businessId || !userId) {
      return;
    }
    const created = await createNote(supabase, businessId, userId, {
      kind,
      title: null,
      content: null,
      checklist: [],
      color: null,
      pinned: false,
    });
    setNotes((prev) => [created, ...prev]);
    setFilter((prev) => (prev.view === 'notes' ? prev : { view: 'notes' }));
    setDialog({ noteId: created.id, startInEdit: true });
  }

  async function handleToggleItem(note: NoteRecord, itemId: string) {
    if (!supabase || !userId || !canToggleChecklist) {
      return;
    }
    // Toggle-only patch (checklist + updated_by): the migration-007 guard
    // rejects anything else from members holding only toggle_checklist.
    const next = await toggleNoteItemDone(supabase, note, userId, itemId);
    patchNoteState(next);
  }

  if (businessLoading || loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress aria-label={tCommon('state.loading')} />
      </Box>
    );
  }

  if (businessError || !supabase || !businessId) {
    // Same degraded handling as the sibling sections: their own empty state.
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h6">{t('home.empty_title')}</Typography>
        <Typography color="text.secondary">{t('home.empty_message')}</Typography>
      </Box>
    );
  }

  if (loadError) {
    // Generic wording, shared with the expenses screen ("Could not load data…").
    return <Alert severity="error">{tExpensesError('load_failed')}</Alert>;
  }

  const drawerList = (
    <List component="nav" sx={{ width: 220 }} dense>
      {(
        [
          { view: 'notes', label: t('drawer.notes'), icon: <StickyNote2OutlinedIcon /> },
          { view: 'completed', label: t('drawer.completed'), icon: <TaskAltIcon /> },
          { view: 'trash', label: t('drawer.trash'), icon: <DeleteOutlineIcon /> },
        ] as const
      ).map((entry) => (
        <ListItemButton
          key={entry.view}
          selected={filter.view === entry.view}
          sx={{ borderRadius: 100, mx: 1, my: 0.25 }}
          onClick={() => {
            setFilter({ view: entry.view });
            setDrawerOpen(false);
          }}
        >
          <ListItemIcon>{entry.icon}</ListItemIcon>
          <ListItemText primary={entry.label} />
        </ListItemButton>
      ))}
      {tags.length > 0 ? (
        <ListSubheader disableSticky sx={{ bgcolor: 'transparent' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {t('drawer.tags_header')}
            {canEdit ? (
              <Tooltip title={t('tags.manage_open')}>
                <IconButton
                  size="small"
                  aria-label={t('tags.manage_open')}
                  onClick={() => {
                    setManageTagsOpen(true);
                    setDrawerOpen(false);
                  }}
                >
                  <EditOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : null}
          </Box>
        </ListSubheader>
      ) : null}
      {tags.map((tag) => (
        <ListItemButton
          key={tag.id}
          selected={filter.view === 'tag' && filter.tagId === tag.id}
          sx={{ borderRadius: 100, mx: 1, my: 0.25 }}
          onClick={() => {
            setFilter({ view: 'tag', tagId: tag.id });
            setDrawerOpen(false);
          }}
        >
          <ListItemIcon>
            <LabelOutlinedIcon />
          </ListItemIcon>
          <ListItemText primary={tag.name} primaryTypographyProps={{ noWrap: true }} />
        </ListItemButton>
      ))}
    </List>
  );

  const emptyMessage =
    search.trim() !== ''
      ? t('search.empty')
      : filter.view === 'completed'
        ? t('completed.empty')
        : filter.view === 'trash'
          ? t('trash.empty')
          : filter.view === 'tag'
            ? t('search.empty')
            : null;

  return (
    <Box sx={{ display: 'flex', gap: 2, pb: 10 }}>
      {/* Desktop: persistent in-page drawer column. */}
      <Box sx={{ display: { xs: 'none', md: 'block' }, flexShrink: 0 }}>{drawerList}</Box>

      {/* Mobile: temporary drawer. The fixed AppShell app bar sits at
          zIndex drawer+1, so it paints OVER the drawer paper — the Toolbar
          spacer (same convention as the shell's permanent rail) keeps the
          first entries below the header instead of hidden under it. */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} sx={{ display: { md: 'none' } }}>
        <Toolbar />
        {drawerList}
      </Drawer>

      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 2 }}>
          <Tooltip title={t('drawer.open')}>
            <IconButton
              aria-label={t('drawer.open')}
              sx={{ display: { md: 'none' } }}
              onClick={() => setDrawerOpen(true)}
            >
              <MenuOpenIcon />
            </IconButton>
          </Tooltip>
          <TextField
            fullWidth
            size="small"
            type="search"
            placeholder={t('home.search_placeholder')}
            inputProps={{ 'aria-label': t('home.search_placeholder') }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Box>

        {filter.view === 'trash' && gridNotes.length > 0 ? (
          <Alert severity="info" sx={{ mb: 2 }}>
            {t('trash.notice')}
          </Alert>
        ) : null}

        {gridNotes.length === 0 ? (
          emptyMessage ? (
            <Typography color="text.secondary" sx={{ textAlign: 'center', mt: 6 }}>
              {emptyMessage}
            </Typography>
          ) : (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <Typography variant="h6">{t('home.empty_title')}</Typography>
              <Typography color="text.secondary">{t('home.empty_message')}</Typography>
            </Box>
          )
        ) : (
          // Keep-like masonry with ROW-MAJOR order: notes are distributed
          // round-robin (i % N) into side-by-side flex columns, so the
          // newest/pinned-first note sits top-left and order zig-zags across
          // the row. (CSS `columns` filled column-major — down-then-across —
          // which put the newest notes at the bottom of the first column.)
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
            {noteColumns.map((column, columnIndex) => (
              <Box
                // Columns are positional buckets; index identity is correct here.
                key={columnIndex}
                sx={{ flex: 1, minWidth: 0 }}
              >
                {column.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    tags={tagsOf(note, tags, links)}
                    canToggle={canToggleChecklist && note.status !== 'trashed'}
                    onOpen={() => setDialog({ noteId: note.id, startInEdit: false })}
                    onToggleItem={(itemId) => void handleToggleItem(note, itemId)}
                  />
                ))}
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {canCreate ? (
        <Stack
          direction="row"
          spacing={1.5}
          sx={{ position: 'fixed', right: 24, bottom: { xs: 80, md: 24 }, zIndex: (theme) => theme.zIndex.appBar }}
        >
          <ResponsiveGlassFab
            icon={<AddIcon />}
            label={t('home.create_note')}
            onClick={() => void handleCreate('note')}
          />
          {canViewChecklists ? (
            // Creating a checklist you cannot see would strand the row —
            // the button needs create AND view_checklists.
            <ResponsiveGlassFab
              icon={<ChecklistIcon />}
              label={t('home.create_checklist')}
              onClick={() => void handleCreate('checklist')}
            />
          ) : null}
        </Stack>
      ) : null}

      {manageTagsOpen && tags.length > 0 ? (
        <ManageTagsDialog
          tags={tags}
          linkedNoteCount={(tagId) => {
            // Scoped list: checklists invisible to this member don't count.
            const noteIds = new Set(scopedNotes.map((n) => n.id));
            return links.filter(
              (l) => l.tag_id === tagId && l.deleted_at === null && noteIds.has(l.note_id),
            ).length;
          }}
          onRename={async (tag, name) => {
            const next = await renameTag(supabase, tag, name);
            setTags((prev) =>
              prev
                .map((existing) => (existing.id === tag.id ? next : existing))
                .sort((a, b) => a.name.localeCompare(b.name)),
            );
          }}
          onDelete={async (tag) => {
            const nextLinks = await deleteTag(supabase, tag, links);
            setLinks(nextLinks);
            setTags((prev) => prev.filter((existing) => existing.id !== tag.id));
            // A grid scoped to the deleted tag falls back to the main list.
            setFilter((prev) => (prev.view === 'tag' && prev.tagId === tag.id ? { view: 'notes' } : prev));
          }}
          onClose={() => setManageTagsOpen(false)}
        />
      ) : null}

      {dialogNote && userId ? (
        <NoteDialog
          key={`${dialogNote.id}:${dialog?.startInEdit}`}
          note={dialogNote}
          tags={tags}
          noteTagIds={liveTagIdsOf(dialogNote.id, links)}
          canEdit={canEdit}
          canDelete={canDelete}
          canToggle={canToggleChecklist}
          startInEdit={dialog?.startInEdit === true}
          onToggleItem={(itemId) => handleToggleItem(dialogNote, itemId)}
          onSaveContent={async (input: NoteInput) => {
            const next = await updateNote(supabase, dialogNote, userId, input);
            patchNoteState(next);
          }}
          onSaveTags={async (tagIds) => {
            const nextLinks = await setNoteTags(supabase, dialogNote, tagIds, links);
            setLinks(nextLinks);
          }}
          onCreateTag={async (name) => {
            const tag = await createTag(supabase, businessId, name);
            setTags((prev) => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)));
            return tag;
          }}
          onTogglePin={async () => {
            patchNoteState(await setNotePinned(supabase, dialogNote, userId, !dialogNote.pinned));
          }}
          onSetStatus={async (status) => {
            patchNoteState(await setNoteStatus(supabase, dialogNote, userId, status));
            setDialog(null);
          }}
          onPurge={async () => {
            await purgeNote(supabase, dialogNote, userId);
            setNotes((prev) => prev.filter((n) => n.id !== dialogNote.id));
            setDialog(null);
          }}
          onShared={(viaClipboard) => {
            if (viaClipboard) {
              setSnack(t('action.share_copied'));
            }
          }}
          onClose={() => setDialog(null)}
          onDiscard={async () => {
            // Create flow abandoned/empty: drop the empty row so it never
            // lingers as a phantom empty card in the grid.
            setDialog(null);
            setNotes((prev) => prev.filter((n) => n.id !== dialogNote.id));
            try {
              await purgeNote(supabase, dialogNote, userId);
            } catch {
              // Best effort — the row is already gone from the visible state.
            }
          }}
        />
      ) : null}

      <Snackbar open={snack !== null} autoHideDuration={4000} onClose={() => setSnack(null)} message={snack} />
    </Box>
  );
}
