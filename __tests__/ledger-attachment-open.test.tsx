/**
 * Ledger attachment-chip routing (view parity):
 * - uploaded (drive_file_id set) → the chip is a link to the Drive viewer URL
 *   in a new tab (rel noopener) with the "opens in Drive" tooltip, and clicking
 *   it does NOT open the row's edit dialog;
 * - pending (drive_file_id null — which is also every guest-mode attachment,
 *   since the local store keeps metadata only, no blobs) → the chip is
 *   disabled with the localized "not uploaded yet" explainer and no link.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import theme from '@/theme/theme';
import en from '../messages/en.json';
import PartyLedger from '@/app/[locale]/(app)/expenses/_components/PartyLedger';
import { normalizePermissions } from '@/lib/permissions/permissions';

jest.mock('@/lib/permissions/useMembership', () => ({
  useMembership: () => ({
    supabase: {},
    business: { id: 'b1', name: 'Biz' },
    userId: 'u1',
    isOwner: true,
    permissions: normalizePermissions({}),
    loading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));

jest.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const party = {
  id: 'p1',
  name: 'Tent House',
  phone: null,
  business_related: true,
  created_at: '2026-01-01T00:00:00Z',
};

const uploaded = {
  id: 'a-up',
  expense_id: 'e1',
  drive_file_id: 'DRIVE123',
  mime_type: 'image/jpeg',
  file_name: 'bill-uploaded.jpg',
  deleted_at: null,
};

const pending = {
  id: 'a-pend',
  expense_id: 'e1',
  drive_file_id: null,
  mime_type: 'application/pdf',
  file_name: 'bill-pending.pdf',
  deleted_at: null,
};

const expense = {
  id: 'e1',
  party_id: 'p1',
  direction: 'paid' as const,
  amount: 500,
  expense_date: '2026-01-10',
  notes: null,
  created_at: '2026-01-10T00:00:00Z',
  expense_attachments: [uploaded, pending],
};

jest.mock('@/app/[locale]/(app)/expenses/_lib/queries', () => ({
  ...jest.requireActual('@/app/[locale]/(app)/expenses/_lib/queries'),
  fetchParty: jest.fn(() => Promise.resolve(party)),
  fetchPartyExpenses: jest.fn(() => Promise.resolve([expense])),
}));

function renderLedger() {
  return render(
    <ThemeProvider theme={theme}>
      <NextIntlClientProvider locale="en" messages={en}>
        <PartyLedger partyId="p1" />
      </NextIntlClientProvider>
    </ThemeProvider>,
  );
}

describe('ledger attachment chip routing', () => {
  it('uploaded chip links to the Drive viewer in a new tab with noopener', async () => {
    renderLedger();
    const chip = (await screen.findByText(uploaded.file_name)).closest('a');
    expect(chip).not.toBeNull();
    expect(chip).toHaveAttribute('href', 'https://drive.google.com/file/d/DRIVE123/view');
    expect(chip).toHaveAttribute('target', '_blank');
    expect(chip!.getAttribute('rel')).toContain('noopener');
    expect(chip).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('uploaded chip carries the opens-in-Drive tooltip', async () => {
    renderLedger();
    const chip = (await screen.findByText(uploaded.file_name)).closest('a')!;
    fireEvent.mouseOver(chip);
    expect(await screen.findByText(en.expenses.entry.attachment_open_drive)).toBeInTheDocument();
  });

  it('clicking the uploaded chip does not open the edit dialog', async () => {
    renderLedger();
    const chip = (await screen.findByText(uploaded.file_name)).closest('a')!;
    fireEvent.click(chip);
    // EntryDialog title would be "Edit entry" — it must not appear.
    expect(screen.queryByText(en.expenses.entry.edit_title)).not.toBeInTheDocument();
  });

  it('pending chip is disabled, has no link, and keeps the pending badge label', async () => {
    renderLedger();
    const label = await screen.findByText(
      `${pending.file_name} — ${en.expenses.entry.attachment_pending}`,
    );
    expect(label.closest('a')).toBeNull();
    const chipRoot = label.closest('.MuiChip-root')!;
    expect(chipRoot.className).toContain('Mui-disabled');
  });

  it('pending chip wrapper carries the not-uploaded tooltip', async () => {
    renderLedger();
    const label = await screen.findByText(
      `${pending.file_name} — ${en.expenses.entry.attachment_pending}`,
    );
    // Tooltip anchors on the span wrapping the disabled chip.
    fireEvent.mouseOver(label.closest('.MuiChip-root')!.parentElement!);
    expect(await screen.findByText(en.expenses.entry.attachment_not_uploaded)).toBeInTheDocument();
  });
});
