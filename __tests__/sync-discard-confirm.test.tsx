/**
 * Sync-status discard confirmation: an RLS-rejected (error) or LWW-lost
 * (conflict) queued change exists only on this device, so the Discard
 * button must confirm before dropping it — cancel keeps the item; confirm
 * discards exactly the chosen seq. Queued (retriable) items offer no
 * discard at all.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { NextIntlClientProvider } from 'next-intl';
import theme from '@/theme/theme';
import en from '../messages/en.json';
import SyncStatusScreen from '@/app/[locale]/(app)/menu/_components/SyncStatusScreen';
import type { OutboxItem } from '@/lib/outbox/db';

const mockUseMembership = jest.fn(() => ({ supabase: {} }));
jest.mock('@/lib/permissions/useMembership', () => ({
  useMembership: () => mockUseMembership(),
}));

const mockDiscard = jest.fn(async () => {});
const mockUseOutbox = jest.fn();
jest.mock('@/lib/outbox/useOutbox', () => ({
  useOutbox: () => mockUseOutbox(),
}));

function item(overrides: Partial<OutboxItem>): OutboxItem {
  return {
    seq: 1,
    id: 'ob-1',
    module: 'booking',
    table: 'bookings',
    entity_id: 'e1',
    operation: 'update',
    payload: {},
    base_updated_at: null,
    label: 'booking',
    attempt_count: 1,
    last_error: null,
    status: 'error',
    created_at: '2026-09-10T00:00:00.000Z',
    ...overrides,
  };
}

function outboxView(items: OutboxItem[]) {
  return {
    items,
    pendingCount: items.filter((i) => i.status !== 'conflict').length,
    lastSyncAt: null,
    online: true,
    syncing: false,
    loaded: true,
    syncNow: jest.fn(async () => {}),
    discard: mockDiscard,
  };
}

function renderScreen() {
  return render(
    <ThemeProvider theme={theme}>
      <NextIntlClientProvider locale="en" messages={en}>
        <SyncStatusScreen />
      </NextIntlClientProvider>
    </ThemeProvider>,
  );
}

const tSync = en.settings.sync;

beforeEach(() => {
  jest.clearAllMocks();
  mockUseMembership.mockReturnValue({ supabase: {} });
});

describe('SyncStatusScreen discard confirmation', () => {
  it('an RLS-rejected (error) item offers Discard behind a confirmation; confirm discards its seq', async () => {
    mockUseOutbox.mockReturnValue(
      outboxView([item({ seq: 7, status: 'error', last_error: 'permission denied for table bookings' })]),
    );
    renderScreen();

    // The rejection reason is surfaced on the row.
    expect(screen.getByText('permission denied for table bookings')).toBeInTheDocument();

    // No discard happens before confirming.
    fireEvent.click(screen.getByRole('button', { name: tSync.discard }));
    expect(mockDiscard).not.toHaveBeenCalled();
    expect(screen.getByText(tSync.discard_confirm_title)).toBeInTheDocument();
    expect(
      screen.getByText(tSync.discard_confirm_message.replace('{entity}', 'booking')),
    ).toBeInTheDocument();

    // Confirm → exactly this item is discarded.
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: tSync.discard }));
    await waitFor(() => expect(mockDiscard).toHaveBeenCalledWith(7));
    expect(mockDiscard).toHaveBeenCalledTimes(1);
  });

  it('cancel keeps the item (no discard call)', async () => {
    mockUseOutbox.mockReturnValue(outboxView([item({ seq: 3, status: 'conflict' })]));
    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: tSync.discard }));
    fireEvent.click(screen.getByRole('button', { name: en.common.action.cancel }));
    await waitFor(() =>
      expect(screen.queryByText(tSync.discard_confirm_title)).not.toBeInTheDocument(),
    );
    expect(mockDiscard).not.toHaveBeenCalled();
  });

  it('queued (retriable) items offer no discard affordance', () => {
    mockUseOutbox.mockReturnValue(outboxView([item({ seq: 2, status: 'queued' })]));
    renderScreen();

    expect(screen.getByText(tSync.status_queued)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: tSync.discard })).not.toBeInTheDocument();
  });
});
