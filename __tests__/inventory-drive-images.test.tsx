/**
 * Drive-first item photos on web (docs/decisions.md — Drive-first item
 * images): thumbnails render from the Drive public endpoint keyed on
 * `drive_image_id`, fall back to the lh3 host on <img> error, and land on
 * the initials/icon placeholder when both fail or when the row has no drive
 * id. Tapping an expandable avatar opens the IN-APP lightbox (owner
 * feedback: never bounce to a Drive tab) with the w1600 large variant on
 * the same ladder, a spinner while it loads, an Open in Drive link for
 * full-res, and a localized failure message when both hosts fail. The
 * master-item dialog's photo picker is gone — photos upload from the
 * Android app only — replaced by a localized hint, while name/unit editing
 * keeps working.
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

function renderAvatar(props: Partial<Parameters<typeof ItemPhotoAvatar>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Kolkata">
      <ItemPhotoAvatar driveImageId={DRIVE_ID} alt="Chairs" size={48} {...props} />
    </NextIntlClientProvider>,
  );
}

/** All <img> nodes with the given alt (RTL's byRole hides the pre-load lightbox img). */
function imgsByAlt(alt: string): HTMLImageElement[] {
  return Array.from(document.querySelectorAll(`img[alt="${alt}"]`));
}

/** The lightbox's large <img> (the avatar img comes first in the DOM). */
function lightboxImg(): HTMLImageElement {
  const imgs = imgsByAlt('Chairs');
  const img = imgs[1];
  if (imgs.length !== 2 || img === undefined) {
    throw new Error(`expected avatar + lightbox images, found ${imgs.length}`);
  }
  return img;
}

describe('ItemPhotoAvatar', () => {
  it('renders the Drive thumbnail endpoint for a row with a drive id', () => {
    renderAvatar();
    expect(screen.getByRole('img', { name: 'Chairs' })).toHaveAttribute(
      'src',
      `https://drive.google.com/thumbnail?id=${DRIVE_ID}&sz=w320`,
    );
  });

  it('falls back to the lh3 host on image error, then to the placeholder', () => {
    renderAvatar();
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
    renderAvatar({ driveImageId: null });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByTestId('Inventory2OutlinedIcon')).toBeInTheDocument();
  });

  it('does not open a lightbox (or a new tab) on click when not expandable', () => {
    const open = jest.fn();
    window.open = open;
    renderAvatar();
    fireEvent.click(screen.getByRole('img', { name: 'Chairs' }));
    expect(open).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('ItemPhotoAvatar in-app lightbox (expandable)', () => {
  function openLightbox() {
    renderAvatar({ expandable: true });
    fireEvent.click(screen.getByRole('img', { name: 'Chairs' }));
    return screen.getByRole('dialog', { name: en.inventory.image.expanded });
  }

  it('opens in-app with the w1600 large variant, a spinner, and no Drive tab', () => {
    const open = jest.fn();
    window.open = open;
    openLightbox();
    // No new tab — the owner-reported bounce to Drive is gone.
    expect(open).not.toHaveBeenCalled();
    // Large image requested from the primary endpoint at lightbox size.
    const large = lightboxImg();
    expect(large).toHaveAttribute(
      'src',
      `https://drive.google.com/thumbnail?id=${DRIVE_ID}&sz=w1600`,
    );
    // Spinner shows until the large variant loads.
    expect(screen.getByRole('progressbar', { name: en.common.state.loading })).toBeInTheDocument();
    fireEvent.load(large);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    // Subtle full-res affordance stays available inside the lightbox.
    expect(
      screen.getByRole('link', { name: en.inventory.image.open_in_drive }),
    ).toHaveAttribute('href', `https://drive.google.com/file/d/${DRIVE_ID}/view`);
  });

  it('closes via the close button and via Esc', async () => {
    const dialog = openLightbox();
    fireEvent.click(screen.getByRole('button', { name: en.common.action.close }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Re-open and close with Escape.
    fireEvent.click(screen.getByRole('img', { name: 'Chairs' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(dialog).not.toBeInTheDocument();
  });

  it('falls back to lh3 at w1600, then shows the localized error with an Open in Drive link', () => {
    openLightbox();
    fireEvent.error(lightboxImg());
    expect(lightboxImg()).toHaveAttribute(
      'src',
      `https://lh3.googleusercontent.com/d/${DRIVE_ID}=w1600`,
    );
    // Both hosts failed → localized message + Drive link as graceful fallback.
    fireEvent.error(lightboxImg());
    expect(imgsByAlt('Chairs')).toHaveLength(1); // avatar only
    expect(screen.getByText(en.inventory.image.load_failed)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: en.inventory.image.open_in_drive }),
    ).toHaveAttribute('href', `https://drive.google.com/file/d/${DRIVE_ID}/view`);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('retries from the primary large endpoint when re-opened after a failure', async () => {
    openLightbox();
    fireEvent.error(lightboxImg());
    fireEvent.error(lightboxImg());
    fireEvent.click(screen.getByRole('button', { name: en.common.action.close }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('img', { name: 'Chairs' }));
    expect(lightboxImg()).toHaveAttribute(
      'src',
      `https://drive.google.com/thumbnail?id=${DRIVE_ID}&sz=w1600`,
    );
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
