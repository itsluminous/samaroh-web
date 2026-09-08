'use client';

import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import Avatar from '@mui/material/Avatar';
import { useEffect, useState } from 'react';
import { driveThumbnailFallbackUrl, driveThumbnailUrl } from '@/lib/images/drive';
import ItemPhotoLightbox from './ItemPhotoLightbox';

interface ItemPhotoAvatarProps {
  /** Drive file id — the authoritative photo reference; null = placeholder. */
  driveImageId: string | null;
  alt: string;
  size: number;
  /** Open the in-app lightbox (large Drive variant) on click. */
  expandable?: boolean;
}

/**
 * Item photo avatar rendered from Google Drive public endpoints
 * (`src/lib/images/drive.ts`): primary thumbnail → lh3 fallback on <img>
 * error → initials/icon placeholder when both fail (e.g. the file is not
 * link-shared yet) or when the row has no `drive_image_id`. When
 * `expandable`, tapping opens the in-app lightbox (`ItemPhotoLightbox`)
 * with the large variant of the photo — never a Drive tab (owner
 * feedback); the lightbox keeps an Open in Drive link for full-res.
 */
export default function ItemPhotoAvatar({
  driveImageId,
  alt,
  size,
  expandable = false,
}: ItemPhotoAvatarProps) {
  // Ladder step: 0 = drive thumbnail, 1 = lh3 fallback, 2 = placeholder.
  const [step, setStep] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  useEffect(() => {
    setStep(0);
  }, [driveImageId]);

  const src =
    driveImageId === null || step >= 2
      ? undefined
      : step === 0
        ? driveThumbnailUrl(driveImageId)
        : driveThumbnailFallbackUrl(driveImageId);
  const clickable = expandable && driveImageId !== null && src !== undefined;

  return (
    <>
      <Avatar
        src={src}
        alt={alt}
        variant="rounded"
        sx={{ width: size, height: size, ...(clickable ? { cursor: 'pointer' } : null) }}
        slotProps={{ img: { onError: () => setStep((current) => current + 1) } }}
        onClick={
          clickable
            ? (event) => {
                event.stopPropagation();
                setLightboxOpen(true);
              }
            : undefined
        }
      >
        <Inventory2OutlinedIcon />
      </Avatar>
      {clickable && (
        <ItemPhotoLightbox
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          driveImageId={driveImageId}
          alt={alt}
        />
      )}
    </>
  );
}
