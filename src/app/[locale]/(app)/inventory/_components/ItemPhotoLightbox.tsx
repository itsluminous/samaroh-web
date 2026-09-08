'use client';

import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import {
  DRIVE_LIGHTBOX_WIDTH,
  driveThumbnailFallbackUrl,
  driveThumbnailUrl,
  driveViewUrl,
} from '@/lib/images/drive';

interface ItemPhotoLightboxProps {
  open: boolean;
  onClose: () => void;
  /** Drive file id of the photo to show large. */
  driveImageId: string;
  alt: string;
}

/**
 * In-app lightbox for item photos (owner feedback: tapping an inventory
 * image must render in-app, not bounce to a Drive tab). Dark backdrop,
 * image loaded large from the same Drive public-endpoint ladder as the
 * avatar (`thumbnail?…&sz=w1600` → lh3 `=w1600`), spinner while loading,
 * and a localized failure message with an Open in Drive link when both
 * hosts fail (e.g. the file is not link-shared yet). Closes via the close
 * button, backdrop click, or Esc (MUI Dialog defaults). A subtle Open in
 * Drive link stays available under the image for full-res/download.
 */
export default function ItemPhotoLightbox({
  open,
  onClose,
  driveImageId,
  alt,
}: ItemPhotoLightboxProps) {
  const t = useTranslations('inventory');
  const tCommon = useTranslations('common');

  // Ladder step: 0 = drive thumbnail (w1600), 1 = lh3 fallback, 2 = error.
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (open) {
      setStep(0);
      setLoaded(false);
    }
  }, [open, driveImageId]);

  const src =
    step === 0
      ? driveThumbnailUrl(driveImageId, DRIVE_LIGHTBOX_WIDTH)
      : step === 1
        ? driveThumbnailFallbackUrl(driveImageId, DRIVE_LIGHTBOX_WIDTH)
        : undefined;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      aria-label={t('image.expanded')}
      // The avatar lives inside list-row buttons (stock list navigates on row
      // click); the dialog portal still bubbles React events to that row, so
      // stop clicks here to keep interactions inside the lightbox.
      onClick={(event) => event.stopPropagation()}
      slotProps={{
        backdrop: { sx: { bgcolor: 'rgba(0, 0, 0, 0.85)' } },
        paper: {
          // The role="dialog" element is the paper — name it there (MUI's
          // auto aria-labelledby points at a DialogTitle we don't render).
          'aria-label': t('image.expanded'),
          'aria-labelledby': undefined,
          sx: {
            bgcolor: 'transparent',
            boxShadow: 'none',
            m: 2,
            alignItems: 'center',
            overflow: 'visible',
          },
        },
      }}
    >
      <IconButton
        aria-label={tCommon('action.close')}
        onClick={onClose}
        sx={{
          position: 'fixed',
          top: 8,
          right: 8,
          color: 'common.white',
          bgcolor: 'rgba(0, 0, 0, 0.4)',
        }}
      >
        <CloseIcon />
      </IconButton>
      {src !== undefined ? (
        <>
          {!loaded && (
            <Box sx={{ p: 6, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress aria-label={tCommon('state.loading')} sx={{ color: 'common.white' }} />
            </Box>
          )}
          <Box
            component="img"
            src={src}
            alt={alt}
            onLoad={() => setLoaded(true)}
            onError={() => {
              setStep((current) => current + 1);
              setLoaded(false);
            }}
            sx={{
              maxWidth: '90vw',
              maxHeight: '82vh',
              display: loaded ? 'block' : 'none',
              borderRadius: 1,
            }}
          />
          <Link
            href={driveViewUrl(driveImageId)}
            target="_blank"
            rel="noopener noreferrer"
            variant="caption"
            sx={{
              mt: 1,
              color: 'grey.400',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
            }}
          >
            <OpenInNewIcon fontSize="inherit" />
            {t('image.open_in_drive')}
          </Link>
        </>
      ) : (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <Typography sx={{ color: 'common.white' }}>{t('image.load_failed')}</Typography>
          <Link
            href={driveViewUrl(driveImageId)}
            target="_blank"
            rel="noopener noreferrer"
            variant="body2"
            sx={{
              mt: 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
            }}
          >
            <OpenInNewIcon fontSize="inherit" />
            {t('image.open_in_drive')}
          </Link>
        </Box>
      )}
    </Dialog>
  );
}
