/**
 * Destination-folder picker (owner feedback 2026-09-29, D18 parity with the
 * Android "Save to Files" folder picker). Web has no share sheet, so the
 * picker applies to the Files screen upload flow when uploading from a
 * NON-folder context — the global search results view: pick/drop → "Save
 * where?" (current route folder preselected) → optional permission-gated
 * "New folder" that creates AND selects the folder → Upload here. Uploads
 * from a folder view stay direct (no picker).
 *
 * 2026-09-30 owner feedback: the picker is a LAZY tree — top level + ROOT
 * folders only at first, expand chevrons reveal children (indented); the
 * preselected folder's ancestors start expanded. Near-full-width paper on a
 * phone viewport, compact rows.
 */
import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { NextIntlClientProvider } from 'next-intl';
import theme from '@/theme/theme';
import en from '../messages/en.json';
import hi from '../messages/hi.json';
import FilesScreen from '@/app/[locale]/(app)/files/_components/FilesScreen';
import { createFolder } from '@/app/[locale]/(app)/files/_lib/queries';
import { runUploadBatch } from '@/app/[locale]/(app)/files/_lib/upload';
import { createLocalClient } from '@/lib/guest/localClient';
import { guestDb } from '@/lib/guest/localDb';
import { emptyPermissions, type MemberPermissions } from '@/lib/permissions/permissions';

const client = createLocalClient();
const BIZ = 'biz-1';
const USER = 'user-1';

jest.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  usePathname: () => '/files',
}));

const mockUseMembership = jest.fn();
jest.mock('@/lib/permissions/useMembership', () => ({
  useMembership: () => mockUseMembership(),
}));

// Signed-in behaviour (the local Dexie store just plays the database).
jest.mock('@/lib/guest/localClient', () => {
  const actual = jest.requireActual('@/lib/guest/localClient');
  return { ...actual, isLocalClient: () => false };
});

const drive = { hasToken: true };
jest.mock('@/lib/google/drive', () => ({
  isDriveConfigured: () => true,
  hasDriveToken: () => drive.hasToken,
  getDriveAccessToken: jest.fn(async () => 'tok'),
  driveDeleteFileBestEffort: jest.fn(async () => true),
}));

// Capture the upload target instead of talking to Drive.
jest.mock('@/app/[locale]/(app)/files/_lib/upload', () => {
  const actual = jest.requireActual('@/app/[locale]/(app)/files/_lib/upload');
  return {
    ...actual,
    createDriveFilesUploader: () => ({}),
    runUploadBatch: jest.fn(async () => ({ uploaded: [], failed: [] })),
  };
});
const mockRunUploadBatch = runUploadBatch as jest.Mock;

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

const pdf = (name = 'a.pdf') => new File(['x'], name, { type: 'application/pdf' });

async function seed() {
  const contracts = await createFolder(client, BIZ, USER, null, 'Contracts');
  const sub = await createFolder(client, BIZ, USER, contracts.id, '2026');
  await createFolder(client, BIZ, USER, null, 'zebra');
  return { contracts, sub };
}

async function pickDuringSearch(query = 'con') {
  await waitFor(() => expect(screen.getAllByText('Contracts').length).toBeGreaterThan(0));
  fireEvent.change(screen.getByLabelText(en.files.home.search_placeholder), { target: { value: query } });
  const input = screen.getByLabelText(en.files.action.upload, { selector: 'input' });
  fireEvent.change(input, { target: { files: [pdf()] } });
}

beforeEach(async () => {
  await Promise.all(guestDb.tables.map((t) => t.clear()));
  mockRunUploadBatch.mockClear();
  drive.hasToken = true;
});

describe('upload from a folder view (no picker)', () => {
  it('uploads straight into the current route folder', async () => {
    const { contracts } = await seed();
    mockUseMembership.mockReturnValue(membership({ permissions: perms({ upload: true }) }));
    renderScreen(contracts.id);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Contracts' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(en.files.action.upload, { selector: 'input' }), { target: { files: [pdf()] } });
    await waitFor(() => expect(mockRunUploadBatch).toHaveBeenCalledTimes(1));
    expect(mockRunUploadBatch.mock.calls[0]![1].target).toMatchObject({ folderId: contracts.id });
    expect(mockRunUploadBatch.mock.calls[0]![1].target.folderChain.map((f: { name: string }) => f.name)).toEqual(['Contracts']);
    expect(screen.queryByText(en.files.share_target.pick_folder_title)).not.toBeInTheDocument();
  });
});

describe('upload from the global search view (destination picker)', () => {
  it('opens the picker with the current route folder preselected; ROOT folders only, chevron expands children (lazy tree)', async () => {
    const { contracts } = await seed();
    mockUseMembership.mockReturnValue(membership({ permissions: perms({ upload: true }) }));
    renderScreen(contracts.id);
    await pickDuringSearch();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(en.files.share_target.pick_folder_title)).toBeInTheDocument();
    // Root row + root folders only — "2026" (a child of Contracts) is not listed yet.
    const rowNames = () => within(dialog).getAllByRole('treeitem').map((o) => o.querySelector('.MuiListItemText-primary')?.textContent);
    expect(rowNames()).toEqual([en.files.home.root_label, 'Contracts', 'zebra']);
    expect(within(dialog).getByRole('treeitem', { name: /Contracts/ })).toHaveAttribute('aria-selected', 'true');
    // Only the row WITH children carries a chevron.
    expect(within(dialog).getByRole('button', { name: en.files.picker.expand.replace('{name}', 'Contracts') })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: en.files.picker.expand.replace('{name}', 'zebra') })).not.toBeInTheDocument();
    // Expand → child appears indented under its parent; collapse hides it again.
    fireEvent.click(within(dialog).getByRole('button', { name: en.files.picker.expand.replace('{name}', 'Contracts') }));
    expect(rowNames()).toEqual([en.files.home.root_label, 'Contracts', '2026', 'zebra']);
    expect(within(dialog).getByRole('treeitem', { name: /2026/ })).toHaveAttribute('aria-level', '3');
    expect(within(dialog).getByRole('treeitem', { name: /Contracts/ })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(within(dialog).getByRole('button', { name: en.files.picker.collapse.replace('{name}', 'Contracts') }));
    expect(rowNames()).toEqual([en.files.home.root_label, 'Contracts', 'zebra']);
    expect(within(dialog).getByText(en.files.picker.selected_hint.replace('{path}', `${en.files.home.root_label} › Contracts`))).toBeInTheDocument();
    // Nothing uploaded yet.
    expect(mockRunUploadBatch).not.toHaveBeenCalled();
  });

  it('confirming uploads into the chosen folder; cancel uploads nothing', async () => {
    const { sub } = await seed();
    mockUseMembership.mockReturnValue(membership({ permissions: perms({ upload: true }) }));
    renderScreen();
    await pickDuringSearch();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: en.files.picker.expand.replace('{name}', 'Contracts') }));
    fireEvent.click(within(dialog).getByRole('treeitem', { name: /2026/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: en.files.picker.confirm }));
    await waitFor(() => expect(mockRunUploadBatch).toHaveBeenCalledTimes(1));
    const target = mockRunUploadBatch.mock.calls[0]![1].target;
    expect(target.folderId).toBe(sub.id);
    expect(target.folderChain.map((f: { name: string }) => f.name)).toEqual(['Contracts', '2026']);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Cancel path.
    fireEvent.change(screen.getByLabelText(en.files.action.upload, { selector: 'input' }), { target: { files: [pdf('b.pdf')] } });
    const again = await screen.findByRole('dialog');
    fireEvent.click(within(again).getByRole('button', { name: en.common.action.cancel }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockRunUploadBatch).toHaveBeenCalledTimes(1);
  });

  it('New folder (manage_folders) creates the folder under the selection, then SELECTS it; confirm uploads there', async () => {
    const { contracts } = await seed();
    mockUseMembership.mockReturnValue(membership({ permissions: perms({ upload: true, manage_folders: true }) }));
    renderScreen();
    await pickDuringSearch();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('treeitem', { name: /Contracts/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: en.files.action.new_folder }));
    const nameField = await screen.findByLabelText(en.files.folder.name_label);
    // Duplicate against LIVE siblings of the selected folder (case-insensitive).
    fireEvent.change(nameField, { target: { value: '2026' } });
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    expect(await screen.findByText(en.files.folder.duplicate)).toBeInTheDocument();
    fireEvent.change(nameField, { target: { value: 'Invoices' } });
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));

    // Created in the store under Contracts, and now the selected option.
    await waitFor(async () => {
      const rows = await guestDb.folders.toArray();
      expect(rows.some((r) => r.name === 'Invoices' && r.parent_id === contracts.id)).toBe(true);
    });
    // The name dialog closes; the picker (title "Save where?") is the one dialog left.
    await waitFor(() => expect(screen.queryByLabelText(en.files.folder.name_label)).not.toBeInTheDocument());
    const picker = screen.getByRole('dialog');
    expect(within(picker).getByText(en.files.share_target.pick_folder_title)).toBeInTheDocument();
    await waitFor(() => expect(within(picker).getByRole('treeitem', { name: /Invoices/ })).toHaveAttribute('aria-selected', 'true'));
    expect(within(picker).getByText(en.files.picker.selected_hint.replace('{path}', `${en.files.home.root_label} › Contracts › Invoices`))).toBeInTheDocument();

    fireEvent.click(within(picker).getByRole('button', { name: en.files.picker.confirm }));
    await waitFor(() => expect(mockRunUploadBatch).toHaveBeenCalledTimes(1));
    const invoices = (await guestDb.folders.toArray()).find((r) => r.name === 'Invoices')!;
    expect(mockRunUploadBatch.mock.calls[0]![1].target.folderId).toBe(invoices.id);
  });

  it('New folder is HIDDEN (not greyed) without manage_folders', async () => {
    await seed();
    mockUseMembership.mockReturnValue(membership({ permissions: perms({ upload: true, manage_folders: false }) }));
    renderScreen();
    await pickDuringSearch();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: en.files.action.new_folder })).not.toBeInTheDocument();
    expect(dialog.querySelectorAll('.Mui-disabled')).toHaveLength(0);
    expect(within(dialog).getByRole('button', { name: en.files.picker.confirm })).toBeInTheDocument();
  });

  it('unlinked Google account: the picker comes first, then the Connect prompt for the chosen folder', async () => {
    drive.hasToken = false;
    const { contracts } = await seed();
    mockUseMembership.mockReturnValue(membership({ permissions: perms({ upload: true }) }));
    renderScreen();
    await pickDuringSearch();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('treeitem', { name: /Contracts/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: en.files.picker.confirm }));
    expect(await screen.findByText(en.files.upload.link_google_title)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: en.files.upload.link_google_connect }));
    await waitFor(() => expect(mockRunUploadBatch).toHaveBeenCalledTimes(1));
    expect(mockRunUploadBatch.mock.calls[0]![1].target.folderId).toBe(contracts.id);
  });

  it('is fully localized in Hindi', async () => {
    await seed();
    mockUseMembership.mockReturnValue(membership({ permissions: perms({ upload: true, manage_folders: true }) }));
    renderScreen(null, hi as Messages, 'hi');
    await waitFor(() => expect(screen.getByText('Contracts')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(hi.files.home.search_placeholder), { target: { value: 'con' } });
    fireEvent.change(screen.getByLabelText(hi.files.action.upload, { selector: 'input' }), { target: { files: [pdf()] } });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(hi.files.share_target.pick_folder_title)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: hi.files.picker.confirm })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: hi.files.action.new_folder })).toBeInTheDocument();
    expect(within(dialog).getByRole('treeitem', { name: hi.files.home.root_label })).toHaveAttribute('aria-selected', 'true');
  });
});
