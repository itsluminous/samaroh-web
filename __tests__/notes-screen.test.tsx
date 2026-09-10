/**
 * NotesScreen against the guest Dexie local client: pinned-first grid,
 * search across title/content/tags, drawer filters (Completed / Trash with
 * its purge notice), permission-gated create buttons and inline checklist
 * toggles, the popup wiring, and the load-time purge sweep (runs only with
 * notes.delete).
 */
import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { NextIntlClientProvider } from 'next-intl';
import theme from '@/theme/theme';
import en from '../messages/en.json';
import NotesScreen from '@/app/[locale]/(app)/notes/_components/NotesScreen';
import { createNote, createTag, setNoteStatus, setNoteTags } from '@/app/[locale]/(app)/notes/_lib/queries';
import { createLocalClient } from '@/lib/guest/localClient';
import { guestDb } from '@/lib/guest/localDb';
import { emptyPermissions, type MemberPermissions } from '@/lib/permissions/permissions';

const client = createLocalClient();
const BIZ = 'biz-1';
const USER = 'user-1';

const mockUseMembership = jest.fn();
jest.mock('@/lib/permissions/useMembership', () => ({
  useMembership: () => mockUseMembership(),
}));

function membership(overrides: Record<string, unknown> = {}) {
  return {
    supabase: client,
    business: { id: BIZ },
    userId: USER,
    isOwner: false,
    permissions: emptyPermissions(),
    loading: false,
    error: null,
    refresh: jest.fn(),
    ...overrides,
  };
}

function viewerPerms(extra: Partial<MemberPermissions['notes']> = {}): MemberPermissions {
  const p = emptyPermissions();
  p.notes = { view: true, create: false, edit: false, delete: false, ...extra };
  return p;
}

function renderScreen() {
  return render(
    <ThemeProvider theme={theme}>
      <NextIntlClientProvider locale="en" messages={en}>
        <NotesScreen />
      </NextIntlClientProvider>
    </ThemeProvider>,
  );
}

async function seedNote(title: string, overrides: Record<string, unknown> = {}) {
  const note = await createNote(client, BIZ, USER, {
    kind: 'note',
    title,
    content: null,
    checklist: [],
    color: null,
    pinned: false,
    ...(overrides as object),
  });
  return note;
}

beforeEach(async () => {
  await Promise.all(guestDb.tables.map((t) => t.clear()));
  mockUseMembership.mockReturnValue(membership({ isOwner: true }));
});

describe('NotesScreen — grid and search', () => {
  it('renders notes pinned-first and shows the empty state without any', async () => {
    const { unmount } = renderScreen();
    expect(await screen.findByText(en.notes.home.empty_title)).toBeInTheDocument();
    unmount();

    await seedNote('Unpinned note');
    await seedNote('Pinned note', { pinned: true });
    renderScreen();
    const pinned = await screen.findByText('Pinned note');
    const unpinned = screen.getByText('Unpinned note');
    // Pinned card precedes the unpinned one in document order.
    expect(pinned.compareDocumentPosition(unpinned) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('distributes cards row-major across flex columns (pinned top-left)', async () => {
    await seedNote('Older note');
    await seedNote('Newer note');
    await seedNote('Pinned note', { pinned: true });
    renderScreen();

    const pinnedCard = (await screen.findByText('Pinned note')).closest('.MuiCard-root');
    expect(pinnedCard).not.toBeNull();
    const firstColumn = pinnedCard!.parentElement!;
    const flexRow = firstColumn.parentElement!;
    // jsdom matches no media query → the xs layout: 2 columns.
    expect(flexRow.children).toHaveLength(2);
    const secondColumn = flexRow.children[1]!;
    // Row-major: pinned (sorted first) heads column 0; the next note heads
    // column 1; the third wraps back under the pinned card. Under the old
    // column-major CSS `columns` all three stacked in a single container.
    expect(firstColumn.firstElementChild).toBe(pinnedCard);
    expect(firstColumn.children).toHaveLength(2);
    expect(secondColumn.children).toHaveLength(1);
  });

  it('search filters by title/content and by tag name', async () => {
    const tagged = await seedNote('Caterer call');
    await seedNote('Decor ideas');
    const tag = await createTag(client, BIZ, 'Vendors');
    await setNoteTags(client, tagged, [tag.id], []);

    renderScreen();
    const searchField = await screen.findByLabelText(en.notes.home.search_placeholder);

    fireEvent.change(searchField, { target: { value: 'decor' } });
    await waitFor(() => expect(screen.queryByText('Caterer call')).not.toBeInTheDocument());
    expect(screen.getByText('Decor ideas')).toBeInTheDocument();

    fireEvent.change(searchField, { target: { value: 'vendors' } });
    await waitFor(() => expect(screen.queryByText('Decor ideas')).not.toBeInTheDocument());
    expect(screen.getByText('Caterer call')).toBeInTheDocument();

    fireEvent.change(searchField, { target: { value: 'zzz' } });
    expect(await screen.findByText(en.notes.search.empty)).toBeInTheDocument();
  });

  it('drawer switches to Completed and Trash (with the 30-day notice)', async () => {
    const done = await seedNote('Finished list');
    const binned = await seedNote('Old scribble');
    await setNoteStatus(client, done, USER, 'completed');
    await setNoteStatus(client, binned, USER, 'trashed');
    await seedNote('Live note');

    renderScreen();
    await screen.findByText('Live note');
    expect(screen.queryByText('Finished list')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: en.notes.drawer.completed }));
    expect(await screen.findByText('Finished list')).toBeInTheDocument();
    expect(screen.queryByText('Live note')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: en.notes.drawer.trash }));
    expect(await screen.findByText('Old scribble')).toBeInTheDocument();
    expect(screen.getByText(en.notes.trash.notice)).toBeInTheDocument();
  });

  it('a drawer tag entry scopes the grid to that tag', async () => {
    const tagged = await seedNote('Tagged note');
    await seedNote('Plain note');
    const tag = await createTag(client, BIZ, 'Decor');
    await setNoteTags(client, tagged, [tag.id], []);

    renderScreen();
    await screen.findByText('Plain note');
    fireEvent.click(screen.getByRole('button', { name: 'Decor' }));
    await waitFor(() => expect(screen.queryByText('Plain note')).not.toBeInTheDocument());
    expect(screen.getByText('Tagged note')).toBeInTheDocument();
  });
});

describe('NotesScreen — permission gating', () => {
  it('hides the create buttons without notes.create and disables checklist toggles without notes.edit', async () => {
    await createNote(client, BIZ, USER, {
      kind: 'checklist',
      title: 'List',
      content: null,
      checklist: [{ id: 'i1', text: 'Garlands', done: false }],
      color: null,
      pinned: false,
    });
    mockUseMembership.mockReturnValue(membership({ permissions: viewerPerms() }));
    renderScreen();
    await screen.findByText('List');
    expect(screen.queryByRole('button', { name: en.notes.home.create_note })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en.notes.home.create_checklist })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Garlands' })).toBeDisabled();
  });

  it('offers both create buttons with notes.create and opens the popup in edit mode', async () => {
    mockUseMembership.mockReturnValue(
      membership({ permissions: viewerPerms({ create: true, edit: true }) }),
    );
    renderScreen();
    const createNoteBtn = await screen.findByRole('button', { name: en.notes.home.create_note });
    expect(screen.getByRole('button', { name: en.notes.home.create_checklist })).toBeInTheDocument();

    fireEvent.click(createNoteBtn);
    // The popup opens straight into edit mode (title field present).
    expect(await screen.findByLabelText(en.notes.editor.title_placeholder)).toBeInTheDocument();
    expect(await guestDb.notes.count()).toBe(1);
  });

  it('opens a view-only popup for a viewer (no edit/pin/delete actions)', async () => {
    await seedNote('Read me');
    mockUseMembership.mockReturnValue(membership({ permissions: viewerPerms() }));
    renderScreen();
    fireEvent.click(await screen.findByText('Read me'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Read me');
    expect(screen.queryByRole('button', { name: en.notes.action.edit })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en.notes.action.pin })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en.notes.action.delete })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.notes.action.share })).toBeInTheDocument();
  });
});

describe('NotesScreen — purge sweep on load', () => {
  async function seedExpiredTrash() {
    const note = await seedNote('Ancient trash');
    await setNoteStatus(client, note, USER, 'trashed');
    await guestDb.notes.update(note.id, { trashed_at: '2020-01-01T00:00:00Z' });
    return note;
  }

  it('tombstones expired trash for members holding notes.delete', async () => {
    await seedExpiredTrash();
    mockUseMembership.mockReturnValue(
      membership({ permissions: viewerPerms({ edit: true, delete: true }) }),
    );
    renderScreen();
    await screen.findByText(en.notes.home.empty_title);
    await waitFor(async () => {
      const row = (await guestDb.notes.toArray())[0];
      expect(row?.deleted_at).not.toBeNull();
    });
  });

  it('leaves expired trash alone without notes.delete', async () => {
    await seedExpiredTrash();
    mockUseMembership.mockReturnValue(membership({ permissions: viewerPerms({ edit: true }) }));
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: en.notes.drawer.trash }));
    expect(await screen.findByText('Ancient trash')).toBeInTheDocument();
    const row = (await guestDb.notes.toArray())[0];
    expect(row?.deleted_at).toBeNull();
  });
});

describe('NotesScreen — mobile drawer app-bar offset', () => {
  it('the temporary drawer starts with a Toolbar spacer so entries clear the fixed app bar', async () => {
    await seedNote('Any note');
    renderScreen();
    await screen.findByText('Any note');

    // Open the mobile drawer via the hamburger.
    fireEvent.click(screen.getByRole('button', { name: en.notes.drawer.open }));
    const paper = document.querySelector('.MuiDrawer-paper');
    expect(paper).not.toBeNull();
    // First child is the Toolbar spacer (the AppShell app bar is fixed at
    // zIndex drawer+1 and would otherwise paint over the first entries).
    expect(paper!.firstElementChild).toHaveClass('MuiToolbar-root');
    // The nav list therefore sits BELOW the spacer — no overlap with the header.
    const list = paper!.querySelector('nav');
    expect(list).not.toBeNull();
    expect(
      paper!.firstElementChild!.compareDocumentPosition(list!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // MUI's toolbar mixin gives the spacer the app bar's min-height.
    expect(paper!.firstElementChild).toHaveStyle({ minHeight: '56px' });
  });
});

describe('NotesScreen — phantom empty rows/cards', () => {
  it('blank checklist items synced from elsewhere never render as empty rows', async () => {
    // Seed a raw row bypassing the sanitized create path (bad mobile data).
    await guestDb.notes.put({
      id: 'raw-1',
      business_id: BIZ,
      kind: 'checklist',
      title: 'Red list',
      content: null,
      checklist: [
        { id: 'i1', text: 'Garlands', done: false },
        { id: 'i2', text: '', done: false },
        { id: 'i3', text: '   ', done: false },
      ],
      color: 'tomato',
      pinned: false,
      status: 'active',
      completed_at: null,
      trashed_at: null,
      created_by: USER,
      updated_by: null,
      created_at: '2026-09-01T10:00:00Z',
      updated_at: '2026-09-01T10:00:00Z',
      deleted_at: null,
    } as never);

    renderScreen();
    await screen.findByText('Red list');
    // Only the non-blank item renders — one checkbox, no empty rows.
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: 'Garlands' })).toBeInTheDocument();
  });

  it('cancelling a brand-new note removes the empty row (no phantom card)', async () => {
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: en.notes.home.create_note }));
    await screen.findByLabelText(en.notes.editor.title_placeholder);
    expect(await guestDb.notes.count()).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: en.common.action.cancel }));
    // The dialog closes and the empty row is tombstoned.
    await waitFor(() =>
      expect(screen.queryByLabelText(en.notes.editor.title_placeholder)).not.toBeInTheDocument(),
    );
    expect(await screen.findByText(en.notes.home.empty_title)).toBeInTheDocument();
    await waitFor(async () => {
      const row = (await guestDb.notes.toArray())[0];
      expect(row?.deleted_at).not.toBeNull();
    });
  });
});
