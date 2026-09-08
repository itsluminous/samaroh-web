/**
 * Entry-dialog attachments are DISPLAY + REMOVE only on web (parity gap G1
 * mitigation — see docs/decisions.md): bill uploads happen in the Android
 * app's Drive pipeline, and the web app has no Drive upload path, so:
 * - no attachment picker renders (a picker would silently discard the file
 *   bytes and strand metadata-only rows in the "pending" state forever),
 * - a localized "attach from the mobile app" hint is shown instead (the
 *   inventory-photo precedent),
 * - existing attachments still render as chips (pending badge for rows the
 *   Android app has not uploaded yet) and can be removed.
 */
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import en from '../messages/en.json';
import { createLocalClient } from '@/lib/guest/localClient';
import EntryDialog from '@/app/[locale]/(app)/expenses/_components/EntryDialog';
import type { ExpenseRecord } from '@/app/[locale]/(app)/expenses/_lib/queries';

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

function wrap(children: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      {children}
    </NextIntlClientProvider>,
  );
}

function entryWith(attachments: ExpenseRecord['expense_attachments']): ExpenseRecord {
  return {
    id: 'e1',
    business_id: 'b1',
    party_id: 'p1',
    direction: 'paid',
    amount: 500,
    expense_date: '2026-09-01',
    notes: null,
    created_by: 'u1',
    created_at: '2026-09-01T00:00:00Z',
    expense_attachments: attachments,
  } as ExpenseRecord;
}

function openDialog(entry: ExpenseRecord | null = null) {
  return wrap(
    <EntryDialog
      open
      partyId="p1"
      direction="paid"
      entry={entry}
      canDelete
      onClose={jest.fn()}
      onSaved={jest.fn()}
    />,
  );
}

describe('EntryDialog attachments (web: display + remove only)', () => {
  it('renders no file picker — attachments cannot be added from web', () => {
    openDialog();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(
      screen.queryByRole('button', { name: en.expenses.entry.attach_camera }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: en.expenses.entry.attach_gallery }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: en.expenses.entry.attach_pdf }),
    ).not.toBeInTheDocument();
  });

  it('shows the localized "attach from the mobile app" hint', () => {
    openDialog();
    expect(screen.getByText(en.expenses.entry.attachments_mobile_hint)).toBeInTheDocument();
  });

  it('still renders existing attachments, marking un-uploaded rows pending', () => {
    openDialog(
      entryWith([
        {
          id: 'a1',
          drive_file_id: 'drive-1',
          file_name: 'bill.jpg',
          mime_type: 'image/jpeg',
        },
        {
          id: 'a2',
          drive_file_id: null,
          file_name: 'invoice.pdf',
          mime_type: 'application/pdf',
        },
      ] as ExpenseRecord['expense_attachments']),
    );
    expect(screen.getByText('bill.jpg')).toBeInTheDocument();
    expect(
      screen.getByText(`invoice.pdf — ${en.expenses.entry.attachment_pending}`),
    ).toBeInTheDocument();
  });
});
