/**
 * Files screen — RENAME (files + folders) and MOVE (owner feedback
 * 2026-09-30; shared migration 010). Kebab entries are permission-HIDDEN,
 * mirroring the server: folders need files.manage_folders; files need the
 * owner / files.delete, or files.upload for the member's OWN uploads. Rename
 * dialogs are prefilled; the move picker is the lazy tree (own subtree hidden
 * for a folder), validates cycle / depth / duplicate / same place on confirm,
 * then updates folder_id / parent_id through the normal write path and
 * mirrors into Drive best-effort.
 */
import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { NextIntlClientProvider } from 'next-intl';
import theme from '@/theme/theme';
import en from '../messages/en.json';
import hi from '../messages/hi.json';
import FilesScreen from '@/app/[locale]/(app)/files/_components/FilesScreen';
import { mirrorFileMove, mirrorFileRename, mirrorFolderMove, mirrorFolderRename } from '@/app/[locale]/(app)/files/_lib/driveMirror';
import { createFolder, insertFileRow } from '@/app/[locale]/(app)/files/_lib/queries';
import { createLocalClient } from '@/lib/guest/localClient';
import { guestDb } from '@/lib/guest/localDb';
import { emptyPermissions, type MemberPermissions } from '@/lib/permissions/permissions';

const client = createLocalClient();
const BIZ = 'biz-1';
const USER = 'user-1';
const OTHER = 'user-2';

jest.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  usePathname: () => '/files',
}));

const mockUseMembership = jest.fn();
jest.mock('@/lib/permissions/useMembership', () => ({
  useMembership: () => mockUseMembership(),
}));

jest.mock('@/lib/guest/localClient', () => {
  const actual = jest.requireActual('@/lib/guest/localClient');
  return { ...actual, isLocalClient: () => false };
});

jest.mock('@/lib/google/drive', () => ({
  isDriveConfigured: () => true,
  hasDriveToken: () => true,
  getDriveAccessToken: jest.fn(async () => 'tok'),
  driveDeleteFileBestEffort: jest.fn(async () => true),
}));

jest.mock('@/app/[locale]/(app)/files/_lib/driveMirror', () => ({
  mirrorFileRename: jest.fn(async () => true),
  mirrorFolderRename: jest.fn(async () => true),
  mirrorFileMove: jest.fn(async () => true),
  mirrorFolderMove: jest.fn(async () => true),
}));

function membership(overrides: Record<string, unknown> = {}) {
  return {
    supabase: client,
    business: { id: BIZ, name: 'Shree Hall', owner_user_id: 'owner-1', owner_name: 'Owner' },
    userId: USER,
    isOwner: false,
    permissions: emptyPermissions(),
    loading: false,
    error: null,
    refresh: jest.fn(),
    ...overrides,
  };
}

function perms(files: Partial<MemberPermissions['files']>): MemberPermissions {
  const p = emptyPermissions();
  p.files = { view: true, upload: false, manage_folders: false, delete: false, ...files };
  return p;
}

type Messages = typeof en;

function renderScreen(folderId: string | null = null, messages: Messages = en, locale = 'en') {
  return render(
    <ThemeProvider theme={theme}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <FilesScreen folderId={folderId} />
      </NextIntlClientProvider>
    </ThemeProvider>,
  );
}

const moreFor = (name: string, messages: Messages = en) => messages.files.action.more.replace('{name}', name);

/**
 *  Contracts ─ 2026 ─ Signed
 *           └ Drafts
 *  zebra
 *  mine.pdf (USER, top level) · theirs.pdf (OTHER, top level) · deep.pdf (in 2026)
 */
async function seed() {
  const contracts = await createFolder(client, BIZ, USER, null, 'Contracts');
  const y2026 = await createFolder(client, BIZ, USER, contracts.id, '2026');
  const signed = await createFolder(client, BIZ, USER, y2026.id, 'Signed');
  const drafts = await createFolder(client, BIZ, USER, contracts.id, 'Drafts');
  const zebra = await createFolder(client, BIZ, USER, null, 'zebra');
  const mine = await insertFileRow(client, BIZ, USER, { folderId: null, name: 'mine.pdf', mimeType: 'application/pdf', sizeBytes: 10, driveFileId: 'd-mine' });
  const theirs = await insertFileRow(client, BIZ, OTHER, { folderId: null, name: 'theirs.pdf', mimeType: 'application/pdf', sizeBytes: 10, driveFileId: 'd-theirs' });
  const deep = await insertFileRow(client, BIZ, USER, { folderId: y2026.id, name: 'deep.pdf', mimeType: 'application/pdf', sizeBytes: 10, driveFileId: 'd-deep' });
  return { contracts, y2026, signed, drafts, zebra, mine, theirs, deep };
}

async function openMenu(name: string) {
  fireEvent.click(screen.getByRole('button', { name: moreFor(name) }));
  return screen.findByRole('menu');
}

// Screen-level flows seed a whole tree in the local store and walk several
// dialogs; under a fully parallel suite the default 5 s budget is too tight.
jest.setTimeout(30_000);

beforeEach(async () => {
  await Promise.all(guestDb.tables.map((t) => t.clear()));
  jest.clearAllMocks();
});

describe('kebab gating (hidden, never greyed)', () => {
  it('viewer: no Rename / Move on files, no folder kebab at all', async () => {
    await seed();
    mockUseMembership.mockReturnValue(membership({ permissions: perms({}) }));
    renderScreen();
    await waitFor(() => expect(screen.getByText('mine.pdf')).toBeInTheDocument());
    const menu = await openMenu('mine.pdf');
    expect(within(menu).queryByText(en.files.action.rename_file)).not.toBeInTheDocument();
    expect(within(menu).queryByText(en.files.action.move)).not.toBeInTheDocument();
    expect(menu.querySelectorAll('.Mui-disabled')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: moreFor('Contracts') })).not.toBeInTheDocument();
  });

  it('files.upload: Rename + Move on the member\'s OWN file only (mirrors files_update RLS)', async () => {
    await seed();
    mockUseMembership.mockReturnValue(membership({ permissions: perms({ upload: true, manage_folders: false }) }));
    renderScreen();
    await waitFor(() => expect(screen.getByText('mine.pdf')).toBeInTheDocument());
    let menu = await openMenu('mine.pdf');
    expect(within(menu).getByText(en.files.action.rename_file)).toBeInTheDocument();
    expect(within(menu).getByText(en.files.action.move)).toBeInTheDocument();
    fireEvent.keyDown(menu, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    menu = await openMenu('theirs.pdf');
    expect(within(menu).queryByText(en.files.action.rename_file)).not.toBeInTheDocument();
    expect(within(menu).queryByText(en.files.action.move)).not.toBeInTheDocument();
    expect(within(menu).getByText(en.files.action.copy_link)).toBeInTheDocument();
  });

  it('files.delete: Rename + Move on any file; manage_folders: Rename + Move folder', async () => {
    await seed();
    mockUseMembership.mockReturnValue(membership({ permissions: perms({ delete: true, manage_folders: true }) }));
    renderScreen();
    await waitFor(() => expect(screen.getByText('theirs.pdf')).toBeInTheDocument());
    let menu = await openMenu('theirs.pdf');
    expect(within(menu).getByText(en.files.action.rename_file)).toBeInTheDocument();
    expect(within(menu).getByText(en.files.action.move)).toBeInTheDocument();
    fireEvent.keyDown(menu, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    menu = await openMenu('Contracts');
    expect(within(menu).getByText(en.files.action.rename_folder)).toBeInTheDocument();
    expect(within(menu).getByText(en.files.action.move)).toBeInTheDocument();
  });

  it('folder kebab with files.delete only: Delete but no Rename / Move folder', async () => {
    await seed();
    mockUseMembership.mockReturnValue(membership({ permissions: perms({ delete: true }) }));
    renderScreen();
    await waitFor(() => expect(screen.getByText('Contracts')).toBeInTheDocument());
    const menu = await openMenu('Contracts');
    expect(within(menu).getByText(en.files.action.delete_folder)).toBeInTheDocument();
    expect(within(menu).queryByText(en.files.action.move)).not.toBeInTheDocument();
    expect(within(menu).queryByText(en.files.action.rename_folder)).not.toBeInTheDocument();
  });
});

describe('rename file', () => {
  it('prefilled dialog → validation → store update + Drive mirror; snackbar', async () => {
    const { mine } = await seed();
    mockUseMembership.mockReturnValue(membership({ permissions: perms({ upload: true }) }));
    renderScreen();
    await waitFor(() => expect(screen.getByText('mine.pdf')).toBeInTheDocument());
    const menu = await openMenu('mine.pdf');
    fireEvent.click(within(menu).getByText(en.files.action.rename_file));
    const field = await screen.findByLabelText(en.files.file.name_label);
    expect(field).toHaveValue('mine.pdf');
    fireEvent.change(field, { target: { value: 'bad/name.pdf' } });
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    expect(await screen.findByText(en.files.file.name_invalid)).toBeInTheDocument();
    fireEvent.change(field, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    expect(await screen.findByText(en.files.file.name_required)).toBeInTheDocument();
    fireEvent.change(field, { target: { value: ' Renamed.pdf ' } });
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    await waitFor(() => expect(screen.getByText('Renamed.pdf')).toBeInTheDocument());
    expect(screen.queryByText('mine.pdf')).not.toBeInTheDocument();
    const row = await guestDb.files.get(mine.id);
    expect(row?.name).toBe('Renamed.pdf');
    expect(row?.folder_id ?? null).toBeNull();
    expect(mirrorFileRename).toHaveBeenCalledWith('d-mine', 'Renamed.pdf');
    expect(await screen.findByText(en.files.file.renamed)).toBeInTheDocument();
  });

  it('a duplicate file name is allowed (names may repeat)', async () => {
    await seed();
    mockUseMembership.mockReturnValue(membership({ isOwner: true }));
    renderScreen();
    await waitFor(() => expect(screen.getByText('mine.pdf')).toBeInTheDocument());
    const menu = await openMenu('mine.pdf');
    fireEvent.click(within(menu).getByText(en.files.action.rename_file));
    const field = await screen.findByLabelText(en.files.file.name_label);
    fireEvent.change(field, { target: { value: 'theirs.pdf' } });
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    await waitFor(() => expect(screen.getAllByText('theirs.pdf')).toHaveLength(2));
  });
});

describe('rename folder mirrors into Drive', () => {
  it('passes the OLD chain and the new name to the best-effort mirror', async () => {
    await seed();
    mockUseMembership.mockReturnValue(membership({ permissions: perms({ manage_folders: true }) }));
    renderScreen();
    await waitFor(() => expect(screen.getByText('Contracts')).toBeInTheDocument());
    const menu = await openMenu('Contracts');
    fireEvent.click(within(menu).getByText(en.files.action.rename_folder));
    const field = await screen.findByLabelText(en.files.folder.name_label);
    expect(field).toHaveValue('Contracts');
    fireEvent.change(field, { target: { value: 'Agreements' } });
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    await waitFor(() => expect(screen.getByText('Agreements')).toBeInTheDocument());
    expect(mirrorFolderRename).toHaveBeenCalledTimes(1);
    const [, , businessName, oldChain, newName] = (mirrorFolderRename as jest.Mock).mock.calls[0]!;
    expect(businessName).toBe('Shree Hall');
    expect(oldChain.map((f: { name: string }) => f.name)).toEqual(['Contracts']);
    expect(newName).toBe('Agreements');
  });
});

describe('move file', () => {
  it('lazy picker preselects the current folder; expanding reveals the destination; confirm updates folder_id + mirrors', async () => {
    const { mine, y2026 } = await seed();
    mockUseMembership.mockReturnValue(membership({ permissions: perms({ upload: true }) }));
    renderScreen();
    await waitFor(() => expect(screen.getByText('mine.pdf')).toBeInTheDocument());
    const menu = await openMenu('mine.pdf');
    fireEvent.click(within(menu).getByText(en.files.action.move));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(en.files.move.title)).toBeInTheDocument();
    // Root folders only; the top level (current location) is preselected.
    const names = () => within(dialog).getAllByRole('treeitem').map((o) => o.querySelector('.MuiListItemText-primary')?.textContent);
    expect(names()).toEqual([en.files.home.root_label, 'Contracts', 'zebra']);
    expect(within(dialog).getByRole('treeitem', { name: new RegExp(en.files.home.root_label) })).toHaveAttribute('aria-selected', 'true');
    // Same place → inline error, nothing written.
    fireEvent.click(within(dialog).getByRole('button', { name: en.files.move.confirm }));
    expect(await within(dialog).findByText(en.files.move.same_folder)).toBeInTheDocument();
    expect((await guestDb.files.get(mine.id))?.folder_id ?? null).toBeNull();
    // Expand Contracts → pick 2026 → Move here.
    fireEvent.click(within(dialog).getByRole('button', { name: en.files.picker.expand.replace('{name}', 'Contracts') }));
    fireEvent.click(within(dialog).getByRole('treeitem', { name: /2026/ }));
    expect(within(dialog).getByText(en.files.move.selected_hint.replace('{path}', `${en.files.home.root_label} › Contracts › 2026`))).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: en.files.move.confirm }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(async () => expect((await guestDb.files.get(mine.id))?.folder_id).toBe(y2026.id));
    // Gone from the top-level listing (moved away), snackbar names the destination.
    expect(screen.queryByText('mine.pdf')).not.toBeInTheDocument();
    expect(await screen.findByText(en.files.move.done.replace('{folder}', '2026'))).toBeInTheDocument();
    expect(mirrorFileMove).toHaveBeenCalledTimes(1);
    const [, , businessName, driveFileId, chain] = (mirrorFileMove as jest.Mock).mock.calls[0]!;
    expect(businessName).toBe('Shree Hall');
    expect(driveFileId).toBe('d-mine');
    expect(chain.map((f: { name: string }) => f.name)).toEqual(['Contracts', '2026']);
  });

  it('the root row is selectable: a nested file moves to the top level', async () => {
    const { deep, y2026 } = await seed();
    mockUseMembership.mockReturnValue(membership({ isOwner: true }));
    renderScreen(y2026.id);
    await waitFor(() => expect(screen.getByText('deep.pdf')).toBeInTheDocument());
    const menu = await openMenu('deep.pdf');
    fireEvent.click(within(menu).getByText(en.files.action.move));
    const dialog = await screen.findByRole('dialog');
    // Ancestors of the current folder start expanded so the selection is visible.
    expect(within(dialog).getByRole('treeitem', { name: /2026/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(within(dialog).getByRole('treeitem', { name: new RegExp(en.files.home.root_label) }));
    fireEvent.click(within(dialog).getByRole('button', { name: en.files.move.confirm }));
    await waitFor(async () => expect((await guestDb.files.get(deep.id))?.folder_id ?? null).toBeNull());
    expect((mirrorFileMove as jest.Mock).mock.calls[0]![4]).toEqual([]);
  });
});

describe('move folder', () => {
  it('hides the moved folder\'s own subtree, rejects a duplicate name in the destination, then moves (subtree follows)', async () => {
    const { contracts, y2026, signed, zebra } = await seed();
    // A live "2026" under zebra makes zebra an invalid destination for Contracts/2026.
    await createFolder(client, BIZ, USER, zebra.id, '2026');
    mockUseMembership.mockReturnValue(membership({ permissions: perms({ manage_folders: true }) }));
    renderScreen(contracts.id);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Contracts' })).toBeInTheDocument());
    const menu = await openMenu('2026');
    fireEvent.click(within(menu).getByText(en.files.action.move));
    const dialog = await screen.findByRole('dialog');
    // Contracts (the current parent) is preselected; expanding it shows Drafts but NOT 2026 (the moved folder) nor Signed (its child).
    expect(within(dialog).getByRole('treeitem', { name: /Contracts/ })).toHaveAttribute('aria-selected', 'true');
    const names = () => within(dialog).getAllByRole('treeitem').map((o) => o.querySelector('.MuiListItemText-primary')?.textContent);
    expect(names()).toEqual([en.files.home.root_label, 'Contracts', 'zebra']);
    fireEvent.click(within(dialog).getByRole('button', { name: en.files.picker.expand.replace('{name}', 'Contracts') }));
    expect(names()).toEqual([en.files.home.root_label, 'Contracts', 'Drafts', 'zebra']);
    // Duplicate in the destination.
    fireEvent.click(within(dialog).getByRole('treeitem', { name: /zebra/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: en.files.move.confirm }));
    expect(await within(dialog).findByText(en.files.move.duplicate_folder)).toBeInTheDocument();
    expect((await guestDb.folders.get(y2026.id))?.parent_id).toBe(contracts.id);
    // Valid: into Drafts.
    fireEvent.click(within(dialog).getByRole('treeitem', { name: /Drafts/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: en.files.move.confirm }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const drafts = (await guestDb.folders.toArray()).find((f) => f.name === 'Drafts')!;
    await waitFor(async () => expect((await guestDb.folders.get(y2026.id))?.parent_id).toBe(drafts.id));
    // Only the moved row changed — the child keeps pointing at it (subtree follows by reference).
    expect((await guestDb.folders.get(signed.id))?.parent_id).toBe(y2026.id);
    expect(mirrorFolderMove).toHaveBeenCalledTimes(1);
    const [, , , oldChain, destinationChain] = (mirrorFolderMove as jest.Mock).mock.calls[0]!;
    expect(oldChain.map((f: { name: string }) => f.name)).toEqual(['Contracts', '2026']);
    expect(destinationChain.map((f: { name: string }) => f.name)).toEqual(['Contracts', 'Drafts', '2026']);
  });

  it('depth cap: a destination that would nest the subtree too deep is rejected inline', async () => {
    // Chain D1..D9 (depth 9) + Contracts/2026/Signed (height 3 for Contracts).
    const { contracts } = await seed();
    let parent: string | null = null;
    for (let i = 1; i <= 9; i += 1) {
      const f = await createFolder(client, BIZ, USER, parent, `D${i}`);
      parent = f.id;
    }
    mockUseMembership.mockReturnValue(membership({ isOwner: true }));
    renderScreen();
    await waitFor(() => expect(screen.getByText('Contracts')).toBeInTheDocument());
    const menu = await openMenu('Contracts');
    fireEvent.click(within(menu).getByText(en.files.action.move));
    const dialog = await screen.findByRole('dialog');
    for (let i = 1; i <= 8; i += 1) {
      fireEvent.click(within(dialog).getByRole('button', { name: en.files.picker.expand.replace('{name}', `D${i}`) }));
    }
    fireEvent.click(within(dialog).getByRole('treeitem', { name: /D9/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: en.files.move.confirm }));
    expect(await within(dialog).findByText(en.files.move.too_deep)).toBeInTheDocument();
    expect((await guestDb.folders.get(contracts.id))?.parent_id ?? null).toBeNull();
    // D7 (7 + 3 = 10) is fine.
    fireEvent.click(within(dialog).getByRole('treeitem', { name: /D7/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: en.files.move.confirm }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const d7 = (await guestDb.folders.toArray()).find((f) => f.name === 'D7')!;
    await waitFor(async () => expect((await guestDb.folders.get(contracts.id))?.parent_id).toBe(d7.id));
  });

  it('is fully localized in Hindi', async () => {
    await seed();
    mockUseMembership.mockReturnValue(membership({ isOwner: true }));
    renderScreen(null, hi as Messages, 'hi');
    await waitFor(() => expect(screen.getByText('Contracts')).toBeInTheDocument());
    // Move "zebra" (a leaf) so "Contracts" stays listed with its chevron.
    fireEvent.click(screen.getByRole('button', { name: moreFor('zebra', hi as Messages) }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText(hi.files.action.rename_folder)).toBeInTheDocument();
    fireEvent.click(within(menu).getByText(hi.files.action.move));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(hi.files.move.title)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: hi.files.move.confirm })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: hi.files.picker.expand.replace('{name}', 'Contracts') })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: hi.files.move.confirm }));
    expect(await within(dialog).findByText(hi.files.move.same_folder)).toBeInTheDocument();
  });
});
