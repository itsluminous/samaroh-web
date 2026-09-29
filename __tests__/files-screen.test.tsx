/**
 * FilesScreen against the guest Dexie local client: listing (folders A–Z then
 * files newest first), breadcrumbs + folder navigation, global search with
 * path subtitles, permission-HIDDEN actions (upload / new folder / kebab
 * entries / owner-only Manage access), guest upload hint, empty states,
 * create-folder validation, delete confirmations, and the picker → size gate
 * → connect-Google prompt routing.
 */
import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { NextIntlClientProvider } from 'next-intl';
import theme from '@/theme/theme';
import en from '../messages/en.json';
import FilesScreen from '@/app/[locale]/(app)/files/_components/FilesScreen';
import { createFolder, insertFileRow } from '@/app/[locale]/(app)/files/_lib/queries';
import { createLocalClient } from '@/lib/guest/localClient';
import { guestDb } from '@/lib/guest/localDb';
import { emptyPermissions, type MemberPermissions } from '@/lib/permissions/permissions';

const client = createLocalClient();
const BIZ = 'biz-1';
const USER = 'user-1';

const mockPush = jest.fn();
jest.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  usePathname: () => '/files',
}));

const mockUseMembership = jest.fn();
jest.mock('@/lib/permissions/useMembership', () => ({
  useMembership: () => mockUseMembership(),
}));

// The guest client is "local"; some cases need the signed-in behaviour
// (Drive prompt) — toggled per test.
let localClient = true;
jest.mock('@/lib/guest/localClient', () => {
  const actual = jest.requireActual('@/lib/guest/localClient');
  return { ...actual, isLocalClient: () => localClient };
});

const drive = {
  configured: false,
  hasToken: false,
};
jest.mock('@/lib/google/drive', () => ({
  isDriveConfigured: () => drive.configured,
  hasDriveToken: () => drive.hasToken,
  getDriveAccessToken: jest.fn(async () => null),
  driveDeleteFileBestEffort: jest.fn(async () => true),
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

function renderScreen(folderId: string | null = null) {
  return render(
    <ThemeProvider theme={theme}>
      <NextIntlClientProvider locale="en" messages={en}>
        <FilesScreen folderId={folderId} />
      </NextIntlClientProvider>
    </ThemeProvider>,
  );
}

async function seed() {
  const contracts = await createFolder(client, BIZ, USER, null, 'Contracts');
  const zebra = await createFolder(client, BIZ, USER, null, 'zebra');
  const sub = await createFolder(client, BIZ, USER, contracts.id, '2026');
  await guestDb.folders.update(zebra.id, { restricted: true });
  await insertFileRow(client, BIZ, USER, { folderId: null, name: 'Older.pdf', mimeType: 'application/pdf', sizeBytes: 300 * 1024, driveFileId: 'd-old' });
  await guestDb.files.update((await guestDb.files.toArray())[0]!.id as string, { created_at: '2026-01-01T00:00:00Z' });
  await insertFileRow(client, BIZ, USER, { folderId: null, name: 'Newer.png', mimeType: 'image/png', sizeBytes: 2 * 1024 * 1024, driveFileId: 'd-new' });
  await insertFileRow(client, BIZ, USER, { folderId: sub.id, name: 'Agreement.pdf', mimeType: 'application/pdf', sizeBytes: 10, driveFileId: 'd-agr' });
  return { contracts, zebra, sub };
}

beforeEach(async () => {
  await Promise.all(guestDb.tables.map((t) => t.clear()));
  mockPush.mockReset();
  localClient = true;
  drive.configured = false;
  drive.hasToken = false;
});

describe('FilesScreen listing + navigation', () => {
  it('lists folders A–Z (with the Restricted chip) then files newest first, with sizes', async () => {
    await seed();
    mockUseMembership.mockReturnValue(membership({ permissions: perms({}) }));
    renderScreen();
    await waitFor(() => expect(screen.getByText('Contracts')).toBeInTheDocument());
    const list = screen.getAllByRole('list').at(-1)!; // the breadcrumb <ol> is a list too
    const items = within(list).getAllByRole('button').map((b) => b.textContent ?? '');
    const names = items.filter((txt) => /Contracts|zebra|Newer|Older/.test(txt));
    expect(names[0]).toContain('Contracts');
    expect(names[1]).toContain('zebra');
    expect(names[1]).toContain(en.files.access.restricted_badge);
    expect(names[2]).toContain('Newer.png');
    expect(names[3]).toContain('Older.pdf');
    // Sizes: 2 MB → "2 MB", 300 KB → "300 KB" (catalog templates).
    expect(names[2]).toContain(en.files.file.size_mb.replace('{size}', '2'));
    expect(names[3]).toContain(en.files.file.size_kb.replace('{size}', '300'));
    // Contracts has 1 item, zebra is empty.
    expect(names[0]).toContain('1 item');
    expect(names[1]).toContain(en.files.folder.item_count_empty);
    expect(screen.getByRole('heading', { name: en.files.home.title })).toBeInTheDocument();
  });

  it('clicking a folder navigates to /files/{id}; inside, the breadcrumb + Up work', async () => {
    const { contracts, sub } = await seed();
    mockUseMembership.mockReturnValue(membership({ permissions: perms({}) }));
    const { unmount } = renderScreen();
    await waitFor(() => expect(screen.getByText('Contracts')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Contracts'));
    expect(mockPush).toHaveBeenCalledWith(`/files/${contracts.id}`);
    unmount();

    renderScreen(sub.id);
    await waitFor(() => expect(screen.getByRole('heading', { name: '2026' })).toBeInTheDocument());
    expect(screen.getByText('Agreement.pdf')).toBeInTheDocument();
    // Breadcrumb: All files › Contracts › 2026 — the ancestors are buttons.
    fireEvent.click(screen.getByRole('button', { name: 'Contracts' }));
    expect(mockPush).toHaveBeenCalledWith(`/files/${contracts.id}`);
    fireEvent.click(screen.getByRole('button', { name: en.files.home.root_label }));
    expect(mockPush).toHaveBeenCalledWith('/files');
    fireEvent.click(screen.getByRole('button', { name: en.files.breadcrumb.up }));
    expect(mockPush).toHaveBeenLastCalledWith(`/files/${contracts.id}`);
  });

  it('shows the no-access notice for a folder id the index does not contain', async () => {
    await seed();
    mockUseMembership.mockReturnValue(membership({ permissions: perms({}) }));
    renderScreen('missing-folder');
    await waitFor(() => expect(screen.getByText(en.files.access.no_access)).toBeInTheDocument());
  });

  it('global search: matches across folders with a path subtitle; empty → search.empty', async () => {
    await seed();
    mockUseMembership.mockReturnValue(membership({ permissions: perms({}) }));
    renderScreen();
    await waitFor(() => expect(screen.getByText('Contracts')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(en.files.home.search_placeholder), { target: { value: 'agree' } });
    expect(await screen.findByText('Agreement.pdf')).toBeInTheDocument();
    expect(screen.getByText(en.files.search.result_path.replace('{path}', `${en.files.home.root_label} › Contracts › 2026`))).toBeInTheDocument();
    expect(screen.queryByText('zebra')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(en.files.home.search_placeholder), { target: { value: 'nothing-here' } });
    expect(screen.getByText(en.files.search.empty)).toBeInTheDocument();
  });

  it('empty states: top level (message only for uploaders) and inside a folder', async () => {
    mockUseMembership.mockReturnValue(membership({ permissions: perms({}) }));
    const { unmount } = renderScreen();
    await waitFor(() => expect(screen.getByText(en.files.home.empty_title)).toBeInTheDocument());
    expect(screen.queryByText(en.files.home.empty_message)).not.toBeInTheDocument();
    unmount();

    mockUseMembership.mockReturnValue(membership({ permissions: perms({ upload: true }) }));
    const second = renderScreen();
    await waitFor(() => expect(screen.getByText(en.files.home.empty_message)).toBeInTheDocument());
    second.unmount();

    const { zebra } = await seed();
    const third = renderScreen(zebra.id);
    await waitFor(() => expect(screen.getByText(en.files.folder.empty_title)).toBeInTheDocument());
    third.unmount();
  });
});

describe('FilesScreen permission-hidden actions', () => {
  it('viewer: no Upload, no New folder, file kebab without Delete, folder kebab absent', async () => {
    await seed();
    mockUseMembership.mockReturnValue(membership({ permissions: perms({}) }));
    renderScreen();
    await waitFor(() => expect(screen.getByText('Contracts')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: en.files.action.upload })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en.files.action.new_folder })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en.files.action.more.replace('{name}', 'Contracts') })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: en.files.action.more.replace('{name}', 'Newer.png') }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText(en.files.action.open)).toBeInTheDocument();
    expect(within(menu).getByText(en.files.action.open_in_drive)).toBeInTheDocument();
    expect(within(menu).getByText(en.files.action.download)).toBeInTheDocument();
    expect(within(menu).getByText(en.files.action.copy_link)).toBeInTheDocument();
    expect(within(menu).queryByText(en.files.action.delete_file)).not.toBeInTheDocument();
  });

  it('manage_folders: New folder + Rename shown; Delete + Manage access hidden', async () => {
    await seed();
    mockUseMembership.mockReturnValue(membership({ permissions: perms({ manage_folders: true }) }));
    renderScreen();
    await waitFor(() => expect(screen.getByText('Contracts')).toBeInTheDocument());
    expect(screen.getAllByRole('button', { name: en.files.action.new_folder }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: en.files.action.more.replace('{name}', 'Contracts') }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText(en.files.action.rename_folder)).toBeInTheDocument();
    expect(within(menu).queryByText(en.files.action.delete_folder)).not.toBeInTheDocument();
    expect(within(menu).queryByText(en.files.action.manage_access)).not.toBeInTheDocument();
  });

  it('owner: every entry incl. Manage access; delete-folder confirm counts descendants', async () => {
    await seed();
    mockUseMembership.mockReturnValue(membership({ isOwner: true }));
    renderScreen();
    await waitFor(() => expect(screen.getByText('Contracts')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: en.files.action.more.replace('{name}', 'Contracts') }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText(en.files.action.manage_access)).toBeInTheDocument();
    fireEvent.click(within(menu).getByText(en.files.action.delete_folder));
    expect(await screen.findByText(en.files.folder.delete_confirm_title)).toBeInTheDocument();
    // Contracts → 2026 → Agreement.pdf = 2 items.
    expect(screen.getByText(/2 items inside/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: en.common.action.delete }));
    await waitFor(() => expect(screen.queryByText('Contracts')).not.toBeInTheDocument());
    expect((await guestDb.folders.toArray()).filter((r) => r.deleted_at !== null)).toHaveLength(2);
    expect((await guestDb.files.toArray()).filter((r) => r.deleted_at !== null)).toHaveLength(1);
  });

  it('delete file: confirm → tombstone, best-effort Drive delete only when linked', async () => {
    await seed();
    mockUseMembership.mockReturnValue(membership({ permissions: perms({ delete: true }) }));
    renderScreen();
    await waitFor(() => expect(screen.getByText('Older.pdf')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: en.files.action.more.replace('{name}', 'Older.pdf') }));
    fireEvent.click(within(await screen.findByRole('menu')).getByText(en.files.action.delete_file));
    expect(await screen.findByText(en.files.file.delete_confirm_title)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: en.common.action.delete }));
    await waitFor(() => expect(screen.queryByText('Older.pdf')).not.toBeInTheDocument());
    const rows = await guestDb.files.toArray();
    expect(rows.find((r) => r.name === 'Older.pdf')?.deleted_at).not.toBeNull();
    const { driveDeleteFileBestEffort } = jest.requireMock('@/lib/google/drive');
    expect(driveDeleteFileBestEffort).not.toHaveBeenCalled(); // no token in this tab
  });

  it('new folder dialog validates duplicates case-insensitively against live siblings and creates', async () => {
    await seed();
    mockUseMembership.mockReturnValue(membership({ permissions: perms({ upload: true, manage_folders: true }) }));
    renderScreen();
    await waitFor(() => expect(screen.getByText('Contracts')).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: en.files.action.new_folder })[0]!);
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText(en.files.folder.name_label);
    fireEvent.change(input, { target: { value: 'contracts' } });
    fireEvent.click(within(dialog).getByRole('button', { name: en.common.action.save }));
    expect(await within(dialog).findByText(en.files.folder.duplicate)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'Receipts' } });
    fireEvent.click(within(dialog).getByRole('button', { name: en.common.action.save }));
    await waitFor(() => expect(screen.getByText('Receipts')).toBeInTheDocument());
    expect(screen.getByText(en.files.folder.created)).toBeInTheDocument();
  });
});

describe('FilesScreen upload routing', () => {
  it('guest mode: Upload replaced by the guest hint (folders still work)', async () => {
    mockUseMembership.mockReturnValue(membership({ permissions: perms({ upload: true, manage_folders: true }) }));
    renderScreen();
    await waitFor(() => expect(screen.getByText(en.files.upload.guest_hint)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: en.files.action.upload })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: en.files.action.new_folder }).length).toBeGreaterThan(0);
  });

  it('signed in without a client id: picking files shows not_configured (no network)', async () => {
    localClient = false;
    mockUseMembership.mockReturnValue(membership({ permissions: perms({ upload: true }) }));
    renderScreen();
    const input = await screen.findByLabelText(en.files.action.upload, { selector: 'input' });
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByText(en.files.upload.not_configured)).toBeInTheDocument();
  });

  it('configured but unlinked: oversized files are skipped, the rest open the Connect Google prompt', async () => {
    localClient = false;
    drive.configured = true;
    mockUseMembership.mockReturnValue(membership({ permissions: perms({ upload: true }) }));
    renderScreen();
    const input = await screen.findByLabelText(en.files.action.upload, { selector: 'input' });
    const big = new File(['x'], 'huge.mov', { type: 'video/mp4' });
    Object.defineProperty(big, 'size', { value: 30 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [big, new File(['x'], 'ok.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByText(en.files.upload.too_large.replace('{name}', 'huge.mov'))).toBeInTheDocument();
    expect(await screen.findByText(en.files.upload.link_google_title)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: en.files.upload.link_google_later }));
    await waitFor(() => expect(screen.queryByText(en.files.upload.link_google_title)).not.toBeInTheDocument());
    expect(await guestDb.files.count()).toBe(0);
  });

  it('more than 20 files rejects the batch', async () => {
    localClient = false;
    drive.configured = true;
    mockUseMembership.mockReturnValue(membership({ permissions: perms({ upload: true }) }));
    renderScreen();
    const input = await screen.findByLabelText(en.files.action.upload, { selector: 'input' });
    const files = Array.from({ length: 21 }, (_, i) => new File(['x'], `f${i}.pdf`, { type: 'application/pdf' }));
    fireEvent.change(input, { target: { files } });
    expect(await screen.findByText(en.files.upload.too_many.replace('{max}', '20'))).toBeInTheDocument();
  });
});
