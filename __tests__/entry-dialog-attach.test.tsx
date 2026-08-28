/**
 * Add-entry attachment source pills (Camera / Gallery / PDF):
 * - all three render as clickable pills on a single non-wrapping ChipRow
 *   (narrow viewports scroll horizontally instead of wrapping — the
 *   owner-reported layout bug),
 * - each pill routes to a source-specific hidden file input (camera capture,
 *   image gallery, PDF picker),
 * - picked files show as pending chips and the pills disable at the
 *   per-entry attachment limit.
 */
import 'fake-indexeddb/auto';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import en from '../messages/en.json';
import { createLocalClient } from '@/lib/guest/localClient';
import EntryDialog from '@/app/[locale]/(app)/expenses/_components/EntryDialog';
import { MAX_ATTACHMENTS_PER_ENTRY } from '@/app/[locale]/(app)/expenses/_lib/queries';

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

function openDialog() {
  return wrap(
    <EntryDialog
      open
      partyId="p1"
      direction="paid"
      entry={null}
      canDelete
      onClose={jest.fn()}
      onSaved={jest.fn()}
    />,
  );
}

function fakeFile(name: string, type: string): File {
  return new File(['x'], name, { type });
}

const pillNames = [
  en.expenses.entry.attach_camera,
  en.expenses.entry.attach_gallery,
  en.expenses.entry.attach_pdf,
];

describe('EntryDialog attachment source pills', () => {
  it('renders Camera, Gallery and PDF pills on one non-wrapping scrollable row', () => {
    openDialog();
    const row = screen.getByLabelText(en.expenses.entry.attach);
    for (const name of pillNames) {
      const pill = screen.getByRole('button', { name });
      expect(row).toContainElement(pill);
    }
    // The ChipRow contract: never wrap — overflow scrolls horizontally.
    expect(row).toHaveStyle({ flexWrap: 'nowrap', overflowX: 'auto' });
  });

  it('wires each pill to a source-specific file input', () => {
    openDialog();
    const camera = screen.getByLabelText<HTMLInputElement>(en.expenses.entry.attach_camera);
    expect(camera).toHaveAttribute('accept', 'image/*');
    expect(camera).toHaveAttribute('capture', 'environment');
    expect(camera.multiple).toBe(false);

    const gallery = screen.getByLabelText<HTMLInputElement>(en.expenses.entry.attach_gallery);
    expect(gallery).toHaveAttribute('accept', 'image/*');
    expect(gallery.multiple).toBe(true);

    const pdf = screen.getByLabelText<HTMLInputElement>(en.expenses.entry.attach_pdf);
    expect(pdf).toHaveAttribute('accept', 'application/pdf');
    expect(pdf.multiple).toBe(true);
  });

  it('adds picked files as pending chips', () => {
    openDialog();
    fireEvent.change(screen.getByLabelText(en.expenses.entry.attach_gallery), {
      target: { files: [fakeFile('bill.jpg', 'image/jpeg')] },
    });
    fireEvent.change(screen.getByLabelText(en.expenses.entry.attach_pdf), {
      target: { files: [fakeFile('invoice.pdf', 'application/pdf')] },
    });
    expect(
      screen.getByText(`bill.jpg — ${en.expenses.entry.attachment_pending}`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`invoice.pdf — ${en.expenses.entry.attachment_pending}`),
    ).toBeInTheDocument();
  });

  it('disables all three pills at the attachment limit', () => {
    openDialog();
    const files = Array.from({ length: MAX_ATTACHMENTS_PER_ENTRY }, (_, i) =>
      fakeFile(`bill-${i}.jpg`, 'image/jpeg'),
    );
    fireEvent.change(screen.getByLabelText(en.expenses.entry.attach_gallery), {
      target: { files },
    });
    for (const name of pillNames) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-disabled', 'true');
    }
  });
});
