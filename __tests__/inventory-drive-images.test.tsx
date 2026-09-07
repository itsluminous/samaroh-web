/**
 * Drive-first item photos on web (docs/decisions.md — Drive-first item
 * images): thumbnails render from the Drive public endpoint keyed on
 * `drive_image_id`, fall back to the lh3 host on <img> error, and land on
 * the initials/icon placeholder when both fail or when the row has no drive
 * id. Full view opens the Drive /file/d/{id}/view page. The master-item
 * dialog's photo picker is gone — photos upload from the Android app only —
 * replaced by a localized hint, while name/unit editing keeps working.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '../messages/en.json';
import ItemPhotoAvatar from '@/app/[locale]/(app)/inventory/_components/ItemPhotoAvatar';
import MasterItemDialog from '@/app/[locale]/(app)/inventory/_components/MasterItemDialog';
import { createMasterItem, updateMasterItem } from '@/app/[locale]/(app)/inventory/_lib/queries';

jest.mock('@/app/[locale]/(app)/inventory/_lib/queries', () => ({
  createMasterItem: jest.fn().mockResolvedValue('new-id'),
  updateMasterItem: jest.fn().mockResolvedValue(undefined),
}));

const mockCreateMasterItem = createMasterItem as jest.Mock;
const mockUpdateMasterItem = updateMasterItem as jest.Mock;

const DRIVE_ID = 'drive-abc-123';

describe('ItemPhotoAvatar', () => {
  it('renders the Drive thumbnail endpoint for a row with a drive id', () => {
    render(<ItemPhotoAvatar driveImageId={DRIVE_ID} alt="Chairs" size={48} />);
    expect(screen.getByRole('img', { name: 'Chairs' })).toHaveAttribute(
      'src',
      `https://drive.google.com/thumbnail?id=${DRIVE_ID}&sz=w320`,
    );
  });

  it('falls back to the lh3 host on image error, then to the placeholder', () => {
    render(<ItemPhotoAvatar driveImageId={DRIVE_ID} alt="Chairs" size={48} />);
    const img = screen.getByRole('img', { name: 'Chairs' });
    fireEvent.error(img);
    expect(screen.getByRole('img', { name: 'Chairs' })).toHaveAttribute(
      'src',
      `https://lh3.googleusercontent.com/d/${DRIVE_ID}=w320`,
    );
    // Second failure (e.g. the file is not link-shared yet): placeholder icon.
    fireEvent.error(screen.getByRole('img', { name: 'Chairs' }));
    expect(screen.queryByRole('img', { name: 'Chairs' })).not.toBeInTheDocument();
    expect(screen.getByTestId('Inventory2OutlinedIcon')).toBeInTheDocument();
  });

  it('renders the placeholder icon when the row has no drive id', () => {
    render(<ItemPhotoAvatar driveImageId={null} alt="Chairs" size={48} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByTestId('Inventory2OutlinedIcon')).toBeInTheDocument();
  });

  it('opens the Drive full view in a new tab when expandable', () => {
    const open = jest.fn();
    window.open = open;
    render(<ItemPhotoAvatar driveImageId={DRIVE_ID} alt="Chairs" size={48} expandable />);
    fireEvent.click(screen.getByRole('img', { name: 'Chairs' }));
    expect(open).toHaveBeenCalledWith(
      `https://drive.google.com/file/d/${DRIVE_ID}/view`,
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('does not open anything on click when not expandable', () => {
    const open = jest.fn();
    window.open = open;
    render(<ItemPhotoAvatar driveImageId={DRIVE_ID} alt="Chairs" size={48} />);
    fireEvent.click(screen.getByRole('img', { name: 'Chairs' }));
    expect(open).not.toHaveBeenCalled();
  });
});

function renderDialog(item: Parameters<typeof MasterItemDialog>[0]['item'] = null) {
  const onSaved = jest.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Kolkata">
      <MasterItemDialog
        open
        item={item}
        items={item ? [item] : []}
        supabase={{} as never}
        businessId="b1"
        onClose={jest.fn()}
        onPickExisting={jest.fn()}
        onSaved={onSaved}
      />
    </NextIntlClientProvider>,
  );
  return { onSaved };
}

describe('MasterItemDialog photo upload disabled', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the add-photos-from-mobile hint instead of a photo picker', () => {
    renderDialog();
    expect(screen.getByText(en.inventory.master.photo_mobile_hint)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: en.inventory.master.choose_photo }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: en.inventory.master.remove_photo }),
    ).not.toBeInTheDocument();
    // No file input mounted at all.
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('previews the current photo from Drive when editing an item with a drive id', () => {
    renderDialog({
      id: 'item1',
      name: 'Chairs',
      unit: 'pcs',
      drive_image_id: DRIVE_ID,
      created_at: '2026-01-01T00:00:00Z',
    });
    expect(screen.getByRole('img', { name: 'Chairs' })).toHaveAttribute(
      'src',
      `https://drive.google.com/thumbnail?id=${DRIVE_ID}&sz=w320`,
    );
  });

  it('still creates an item (name/unit only — no photo arguments)', async () => {
    const { onSaved } = renderDialog();
    fireEvent.change(screen.getByLabelText(en.inventory.master.name_label), {
      target: { value: 'Lamps' },
    });
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mockCreateMasterItem).toHaveBeenCalledWith(expect.anything(), 'b1', 'Lamps', 'pcs');
    expect(mockUpdateMasterItem).not.toHaveBeenCalled();
  });
});
