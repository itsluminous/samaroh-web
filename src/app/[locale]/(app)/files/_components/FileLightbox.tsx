'use client';

/**
 * In-app image viewer for Files (design D16 — same public thumbnail ladder as
 * the inventory lightbox: `thumbnail?…&sz=w1600` → lh3 `=w1600`; when both
 * fail, a localized message with an Open in Google Drive link).
 */
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
import { DRIVE_LIGHTBOX_WIDTH, driveThumbnailFallbackUrl, driveThumbnailUrl, driveViewUrl } from '@/lib/images/drive';
import type { FileRecord } from '../_lib/types';

export default function FileLightbox({ file, onClose }: { file: FileRecord | null; onClose: () => void }) {
  const t = useTranslations('files');
  const tCommon = useTranslations('common');
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setStep(0);
    setLoaded(false);
  }, [file?.id]);

  const open = file !== null;
  const id = file?.drive_file_id ?? '';
  const src =
    step === 0
      ? driveThumbnailUrl(id, DRIVE_LIGHTBOX_WIDTH)
      : step === 1
        ? driveThumbnailFallbackUrl(id, DRIVE_LIGHTBOX_WIDTH)
        : undefined;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      slotProps={{
        backdrop: { sx: { bgcolor: 'rgba(0, 0, 0, 0.85)' } },
        paper: {
          'aria-label': file?.name ?? '',
          'aria-labelledby': undefined,
          sx: { bgcolor: 'transparent', boxShadow: 'none', m: 2, alignItems: 'center', overflow: 'visible' },
        },
      }}
    >
      <IconButton
        aria-label={tCommon('action.close')}
        onClick={onClose}
        sx={{ position: 'fixed', top: 8, right: 8, color: 'common.white', bgcolor: 'rgba(0, 0, 0, 0.4)' }}
      >
        <CloseIcon />
      </IconButton>
      {file && src !== undefined ? (
        <>
          {!loaded && (
            <Box sx={{ p: 6, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress aria-label={tCommon('state.loading')} sx={{ color: 'common.white' }} />
            </Box>
          )}
          <Box
            component="img"
            src={src}
            alt={file.name}
            onLoad={() => setLoaded(true)}
            onError={() => {
              setStep((current) => current + 1);
              setLoaded(false);
            }}
            sx={{ maxWidth: '90vw', maxHeight: '82vh', display: loaded ? 'block' : 'none', borderRadius: 1 }}
          />
          <Typography variant="caption" sx={{ mt: 1, color: 'grey.300' }}>
            {file.name}
          </Typography>
          <Link
            href={driveViewUrl(file.drive_file_id)}
            target="_blank"
            rel="noopener noreferrer"
            variant="caption"
            sx={{ color: 'grey.400', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
          >
            <OpenInNewIcon fontSize="inherit" />
            {t('action.open_in_drive')}
          </Link>
        </>
      ) : file ? (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <Typography sx={{ color: 'common.white' }}>{t('file.open_failed')}</Typography>
          <Link
            href={driveViewUrl(file.drive_file_id)}
            target="_blank"
            rel="noopener noreferrer"
            variant="body2"
            sx={{ mt: 1, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
          >
            <OpenInNewIcon fontSize="inherit" />
            {t('action.open_in_drive')}
          </Link>
        </Box>
      ) : null}
    </Dialog>
  );
}
