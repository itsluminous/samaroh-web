/**
 * Sync-in-progress state mapping: the outbox layer exposes isReplaying() and
 * fires OUTBOX_SYNC_STATE_EVENT at replay start/end; useOutbox mirrors it in
 * `syncing` (so background OutboxSync replays animate the indicator too, not
 * just a locally triggered "Sync now"); the app-bar SyncIndicator switches
 * its accessible name to the localized "Syncing…" while a replay runs — the
 * static state reduced-motion users rely on.
 */
import 'fake-indexeddb/auto';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { SupabaseClient } from '@supabase/supabase-js';
import en from '../messages/en.json';
import SyncIndicator from '@/components/SyncIndicator';
import { outboxDb } from '@/lib/outbox/db';
import {
  enqueue,
  isReplaying,
  OUTBOX_SYNC_STATE_EVENT,
  replayOutbox,
} from '@/lib/outbox/outbox';
import { useOutbox } from '@/lib/outbox/useOutbox';

jest.mock('next/navigation', () => ({
  usePathname: () => '/en/booking',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
  useParams: () => ({ locale: 'en' }),
  useSearchParams: () => new URLSearchParams(),
  redirect: jest.fn(),
}));

const mockCreateClient = jest.fn((): SupabaseClient | null => null);
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => mockCreateClient(),
}));

/** Fake client whose insert resolves only when the test releases it. */
function slowSupabase() {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const client = {
    from: () => ({
      insert: async () => {
        await gate;
        return { error: null };
      },
    }),
  } as unknown as SupabaseClient;
  return { client, release };
}

function queueCreate(label: string) {
  return enqueue({
    module: 'inventory',
    table: 'inventory_transactions',
    entityId: `id-${label}`,
    operation: 'create',
    payload: { id: `id-${label}` },
    label,
  });
}

beforeEach(async () => {
  await outboxDb.outbox.clear();
  await outboxDb.meta.clear();
});

describe('outbox layer is-syncing state', () => {
  it('isReplaying flips true during a replay run and back to false after', async () => {
    await queueCreate('a');
    const observed: boolean[] = [];
    const onState = () => observed.push(isReplaying());
    window.addEventListener(OUTBOX_SYNC_STATE_EVENT, onState);
    try {
      expect(isReplaying()).toBe(false);
      const { client, release } = slowSupabase();
      const run = replayOutbox(client);
      expect(isReplaying()).toBe(true);
      release();
      const result = await run;
      expect(result.applied).toBe(1);
      expect(isReplaying()).toBe(false);
      // Exactly one start (true) and one end (false) notification.
      expect(observed).toEqual([true, false]);
    } finally {
      window.removeEventListener(OUTBOX_SYNC_STATE_EVENT, onState);
    }
  });
});

describe('useOutbox syncing mapping', () => {
  it('mirrors a replay started OUTSIDE the hook (background OutboxSync run)', async () => {
    await queueCreate('bg');
    const { client, release } = slowSupabase();
    const { result } = renderHook(() => useOutbox(client));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.syncing).toBe(false);

    let run: Promise<unknown> = Promise.resolve();
    act(() => {
      run = replayOutbox(client);
    });
    expect(result.current.syncing).toBe(true);

    release();
    await act(async () => {
      await run;
    });
    expect(result.current.syncing).toBe(false);
  });

  it('syncNow drives the same shared state', async () => {
    await queueCreate('local');
    const { client, release } = slowSupabase();
    const { result } = renderHook(() => useOutbox(client));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let run: Promise<void> = Promise.resolve();
    act(() => {
      run = result.current.syncNow();
    });
    expect(result.current.syncing).toBe(true);

    release();
    await act(async () => {
      await run;
    });
    expect(result.current.syncing).toBe(false);
  });
});

describe('SyncIndicator syncing state', () => {
  function renderIndicator() {
    return render(
      <NextIntlClientProvider locale="en" messages={en}>
        <SyncIndicator />
      </NextIntlClientProvider>,
    );
  }

  // No Supabase env in tests → createClient() returns null → hidden.
  it('renders nothing without a configured client', async () => {
    mockCreateClient.mockReturnValue(null);
    const { container } = renderIndicator();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('shows the static localized "Syncing…" name while a replay runs', async () => {
    const { client, release } = slowSupabase();
    mockCreateClient.mockReturnValue(client);
    await queueCreate('ui');
    renderIndicator();
    // Idle: named after the sync-status destination, cloud iconography.
    expect(await screen.findByRole('link', { name: en.settings.sync.title })).toBeInTheDocument();
    expect(screen.getByTestId('CloudSyncIcon')).toBeInTheDocument();
    expect(screen.queryByTestId('SyncIcon')).not.toBeInTheDocument();

    let run: Promise<unknown> = Promise.resolve();
    act(() => {
      run = replayOutbox(client);
    });
    // Syncing: accessible name flips to the shared "Syncing…" string —
    // present regardless of whether the rotation animation is reduced.
    expect(screen.getByRole('link', { name: en.sync.notification.syncing })).toBeInTheDocument();
    // Android parity: the active state is a plain circular-arrows sync
    // glyph (the thing that rotates), not the cloud.
    expect(screen.getByTestId('SyncIcon')).toBeInTheDocument();
    expect(screen.queryByTestId('CloudSyncIcon')).not.toBeInTheDocument();

    release();
    await act(async () => {
      await run;
    });
    expect(screen.getByRole('link', { name: en.settings.sync.title })).toBeInTheDocument();
    // Back to idle: cloud returns.
    expect(screen.getByTestId('CloudSyncIcon')).toBeInTheDocument();
    expect(screen.queryByTestId('SyncIcon')).not.toBeInTheDocument();
  });
});
