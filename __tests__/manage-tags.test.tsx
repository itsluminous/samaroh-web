/**
 * Manage-tags flow on NotesScreen (guest Dexie local client): the edit
 * affordance next to the drawer's Tags header (notes.edit-gated), rename
 * with duplicate-name validation, and delete behind a confirmation that
 * states the linked-note count — the cascade tombstones the tag and its
 * live links, so it disappears from the drawer and from note cards while
 * the notes themselves stay.
 */
import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { NextIntlClientProvider } from 'next-intl';
import theme from '@/theme/theme';
import en from '../messages/en.json';
import NotesScreen from '@/app/[locale]/(app)/notes/_components/NotesScreen';
import { createNote, createTag, setNoteTags } from '@/app/[locale]/(app)/notes/_lib/queries';
import type { NoteTagLinkRecord } from '@/app/[locale]/(app)/notes/_lib/types';
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
    isOwner: true,
    permissions: emptyPermissions(),
    loading: false,
    error: null,
    refresh: jest.fn(),
    ...overrides,
  };
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

async function seed() {
  const noteA = await createNote(client, BIZ, USER, { kind: 'note', title: 'Note A', content: null, checklist: [], color: null, pinned: false });
  const noteB = await createNote(client, BIZ, USER, { kind: 'note', title: 'Note B', content: null, checklist: [], color: null, pinned: false });
  const vendors = await createTag(client, BIZ, 'Vendors');
  const decor = await createTag(client, BIZ, 'Decor');
  let links: NoteTagLinkRecord[] = [];
  links = await setNoteTags(client, noteA, [vendors.id, decor.id], links);
  await setNoteTags(client, noteB, [vendors.id], links);
  return { noteA, noteB, vendors, decor };
}

async function openManageDialog() {
  renderScreen();
  fireEvent.click(await screen.findByRole('button', { name: en.notes.tags.manage_open }));
  return screen.findByRole('dialog');
}

beforeEach(async () => {
  await Promise.all(guestDb.tables.map((t) => t.clear()));
  mockUseMembership.mockReturnValue(membership());
});

describe('manage tags — affordance', () => {
  it('is hidden without notes.edit', async () => {
    await seed();
    const viewer = emptyPermissions() as MemberPermissions;
    viewer.notes = { view: true, view_checklists: true, create: false, edit: false, toggle_checklist: false, delete: false };
    mockUseMembership.mockReturnValue(membership({ isOwner: false, permissions: viewer }));
    renderScreen();
    await screen.findByText('Note A');
    expect(screen.queryByRole('button', { name: en.notes.tags.manage_open })).not.toBeInTheDocument();
  });
});

describe('manage tags — rename', () => {
  it('renames a tag; the drawer entry and note chips update', async () => {
    await seed();
    const dialog = await openManageDialog();
    fireEvent.click(within(dialog).getAllByRole('button', { name: en.notes.tags.rename })[1]!);
    const field = within(dialog).getByLabelText(en.notes.picker.tags_name_placeholder);
    fireEvent.change(field, { target: { value: 'Suppliers' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    await waitFor(() => expect(within(dialog).getByText('Suppliers')).toBeInTheDocument());
    fireEvent.click(within(dialog).getByRole('button', { name: en.common.action.close }));
    // Drawer entry renamed; chips on both cards show the new name.
    expect(await screen.findByRole('button', { name: 'Suppliers' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vendors' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Suppliers').length).toBeGreaterThanOrEqual(2);
    // Persisted.
    const stored = await guestDb.note_tags.toArray();
    expect(stored.map((t) => (t as unknown as { name: string }).name).sort()).toEqual(['Decor', 'Suppliers']);
  });

  it('rejects a duplicate name (case-insensitive) with inline validation', async () => {
    await seed();
    const dialog = await openManageDialog();
    // Rows sort by name: [Decor, Vendors] — rename Decor to "vendors".
    fireEvent.click(within(dialog).getAllByRole('button', { name: en.notes.tags.rename })[0]!);
    const field = within(dialog).getByLabelText(en.notes.picker.tags_name_placeholder);
    fireEvent.change(field, { target: { value: 'vendors' } });

    expect(await within(dialog).findByText(en.notes.tags.rename_duplicate)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: en.common.action.save })).toBeDisabled();
    // Enter is a no-op while invalid — the field stays in edit mode.
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(within(dialog).getByLabelText(en.notes.picker.tags_name_placeholder)).toBeInTheDocument();
    const stored = await guestDb.note_tags.toArray();
    expect(stored.map((t) => (t as unknown as { name: string }).name).sort()).toEqual(['Decor', 'Vendors']);
  });
});

describe('manage tags — delete', () => {
  it('confirms with the linked-note count, then tombstones the tag and its links', async () => {
    const { vendors } = await seed();
    const dialog = await openManageDialog();
    // Rows sort by name: [Decor, Vendors] — delete Vendors (linked to 2 notes).
    fireEvent.click(within(dialog).getAllByRole('button', { name: en.notes.tags.delete })[1]!);

    expect(
      await screen.findByText(en.notes.tags.delete_title.replace('{name}', 'Vendors')),
    ).toBeInTheDocument();
    expect(
      screen.getByText(en.notes.tags.delete_message.replace('{count}', '2')),
    ).toBeInTheDocument();

    // The confirmation dialog's own Delete button (not the row icons).
    const confirm = screen
      .getAllByRole('button', { name: en.notes.tags.delete })
      .find((b) => b.tagName === 'BUTTON' && b.textContent === en.notes.tags.delete)!;
    fireEvent.click(confirm);

    // Tag gone from the manage list and the drawer; notes survive without it.
    await waitFor(() => expect(within(dialog).queryByText('Vendors')).not.toBeInTheDocument());
    fireEvent.click(await within(dialog).findByRole('button', { name: en.common.action.close }));
    expect(screen.queryByRole('button', { name: 'Vendors' })).not.toBeInTheDocument();
    expect(screen.getByText('Note A')).toBeInTheDocument();
    expect(screen.getByText('Note B')).toBeInTheDocument();

    // Cascade persisted: tag tombstoned + its 2 links tombstoned; Decor's link lives.
    const storedTag = await guestDb.note_tags.get(vendors.id);
    expect((storedTag as unknown as { deleted_at: string | null }).deleted_at).not.toBeNull();
    const links = (await guestDb.note_tag_links.toArray()) as unknown as { tag_id: string; deleted_at: string | null }[];
    expect(links.filter((l) => l.tag_id === vendors.id).every((l) => l.deleted_at !== null)).toBe(true);
    expect(links.filter((l) => l.deleted_at === null)).toHaveLength(1);
  });

  it('resets a grid scoped to the deleted tag back to the main list', async () => {
    await seed();
    renderScreen();
    // Scope the grid to the Vendors tag first.
    fireEvent.click(await screen.findByRole('button', { name: 'Vendors' }));
    await screen.findByText('Note A');

    fireEvent.click(screen.getByRole('button', { name: en.notes.tags.manage_open }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getAllByRole('button', { name: en.notes.tags.delete })[1]!);
    const confirm = await screen.findByText(en.notes.tags.delete_title.replace('{name}', 'Vendors'));
    expect(confirm).toBeInTheDocument();
    fireEvent.click(
      screen
        .getAllByRole('button', { name: en.notes.tags.delete })
        .find((b) => b.textContent === en.notes.tags.delete)!,
    );
    fireEvent.click(await within(dialog).findByRole('button', { name: en.common.action.close }));

    // Back on the main list: both notes visible again.
    expect(await screen.findByText('Note A')).toBeInTheDocument();
    expect(screen.getByText('Note B')).toBeInTheDocument();
  });
});
