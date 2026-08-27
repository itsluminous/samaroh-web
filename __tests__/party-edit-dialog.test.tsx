/**
 * Edit-party dialog: full create-parity validation (name required, duplicate
 * name against the business's OTHER parties, own unchanged name allowed),
 * save patching name/phone/business flag, and the gated delete action with
 * its cascade confirmation. Runs against the guest local client so the real
 * query paths (fetchParties / updateParty / deleteParty) are exercised.
 */
import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import en from '../messages/en.json';
import { createLocalClient } from '@/lib/guest/localClient';
import { guestDb, localTable } from '@/lib/guest/localDb';
import EditPartyDialog from '@/app/[locale]/(app)/expenses/_components/EditPartyDialog';
import { fetchParties, type PartyRecord } from '@/app/[locale]/(app)/expenses/_lib/queries';

const mockClient = createLocalClient();

jest.mock('@/lib/hooks/useBusiness', () => ({
  useBusiness: () => ({
    supabase: mockClient,
    businessId: 'b1',
    businessName: 'Sharma Tent House',
    userId: 'u1',
    loading: false,
    error: null,
  }),
}));

const PARTY: PartyRecord = {
  id: 'p1',
  name: 'Tent House',
  phone: '9876543210',
  business_related: true,
  created_at: '2026-01-01T00:00:00Z',
};

function wrap(children: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      {children}
    </NextIntlClientProvider>,
  );
}

beforeEach(async () => {
  await Promise.all(guestDb.tables.map((t) => t.clear()));
  await mockClient.from('parties').insert([
    { id: 'p1', business_id: 'b1', name: 'Tent House', phone: '9876543210', business_related: true },
    { id: 'p2', business_id: 'b1', name: 'Caterer', phone: null, business_related: true },
  ]);
});

describe('EditPartyDialog validation', () => {
  it('rejects an empty name', async () => {
    const onSaved = jest.fn();
    wrap(
      <EditPartyDialog
        open
        party={PARTY}
        canDelete
        onClose={jest.fn()}
        onSaved={onSaved}
        onDeleted={jest.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(en.expenses.person.name_label), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    expect(await screen.findByText(en.expenses.person.name_required)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('rejects a name that duplicates ANOTHER party (case-insensitive)', async () => {
    const onSaved = jest.fn();
    wrap(
      <EditPartyDialog
        open
        party={PARTY}
        canDelete
        onClose={jest.fn()}
        onSaved={onSaved}
        onDeleted={jest.fn()}
      />,
    );
    // Flush the dialog's own fetchParties round trip (real local client →
    // fake IndexedDB) so `others` is populated before validating against it.
    // Waiting on the raw Dexie row is NOT enough — the component's setOthers
    // lands on a later task, which raced the save click under suite load.
    await waitFor(async () => {
      expect(await localTable('parties')!.get('p2')).toBeTruthy();
    });
    await act(async () => {
      await fetchParties(mockClient, 'b1');
    });
    fireEvent.change(screen.getByLabelText(en.expenses.person.name_label), {
      target: { value: 'caterer' },
    });
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    expect(await screen.findByText(en.expenses.person.duplicate_exists)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('allows keeping the party own name and saves name/phone edits', async () => {
    const onSaved = jest.fn();
    wrap(
      <EditPartyDialog
        open
        party={PARTY}
        canDelete
        onClose={jest.fn()}
        onSaved={onSaved}
        onDeleted={jest.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(en.expenses.person.name_label), {
      target: { value: '  Tent House Deluxe  ' },
    });
    fireEvent.change(screen.getByLabelText(en.expenses.person.phone_label), {
      target: { value: '9000000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p1', name: 'Tent House Deluxe', phone: '9000000000' }),
    );
    const row = (await localTable('parties')!.get('p1')) as Record<string, unknown>;
    expect(row.name).toBe('Tent House Deluxe');
    expect(row.phone).toBe('9000000000');
  });
});

describe('EditPartyDialog delete action', () => {
  it('hides the delete button without the delete permission', () => {
    wrap(
      <EditPartyDialog
        open
        party={PARTY}
        canDelete={false}
        onClose={jest.fn()}
        onSaved={jest.fn()}
        onDeleted={jest.fn()}
      />,
    );
    expect(
      screen.queryByRole('button', { name: en.expenses.party.delete_action }),
    ).not.toBeInTheDocument();
  });

  it('confirms with the cascade warning, tombstones the party and reports back', async () => {
    const onDeleted = jest.fn();
    wrap(
      <EditPartyDialog
        open
        party={PARTY}
        canDelete
        onClose={jest.fn()}
        onSaved={jest.fn()}
        onDeleted={onDeleted}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: en.expenses.party.delete_action }));
    expect(
      await screen.findByText(en.expenses.party.delete_confirm_message),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: en.common.action.delete }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    const row = (await localTable('parties')!.get('p1')) as Record<string, unknown>;
    expect(row.deleted_at).toEqual(expect.any(String));
  });
});
