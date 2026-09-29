'use client';

/**
 * Thumbnail-or-type-icon for a file row/tile (design D16): images and PDFs
 * load Drive's public thumbnail ladder (`thumbnail?id=…&sz=w320` → lh3
 * fallback → type icon when both fail, e.g. not link-shared yet); every
 * other MIME renders a type icon straight away.
 */
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import AudiotrackIcon from '@mui/icons-material/Audiotrack';
import FolderZipOutlinedIcon from '@mui/icons-material/FolderZipOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import Box from '@mui/material/Box';
import { useEffect, useState } from 'react';
import { DRIVE_THUMBNAIL_WIDTH, driveThumbnailFallbackUrl, driveThumbnailUrl } from '@/lib/images/drive';
import { fileTypeKind, hasThumbnail, type FileTypeKind } from '../_lib/tree';

const ICONS: Record<FileTypeKind, typeof ImageOutlinedIcon> = {
  image: ImageOutlinedIcon,
  pdf: PictureAsPdfOutlinedIcon,
  video: VideocamOutlinedIcon,
  audio: AudiotrackIcon,
  archive: FolderZipOutlinedIcon,
  sheet: TableChartOutlinedIcon,
  doc: ArticleOutlinedIcon,
  other: InsertDriveFileOutlinedIcon,
};

export default function FileThumb({
  driveFileId,
  mimeType,
  alt,
  size,
}: {
  driveFileId: string;
  mimeType: string;
  /** Localized `files.file.thumbnail_a11y`. */
  alt: string;
  /** Square edge in px. */
  size: number;
}) {
  // Ladder step: 0 = drive thumbnail, 1 = lh3 fallback, 2 = type icon.
  const [step, setStep] = useState(hasThumbnail(mimeType) ? 0 : 2);
  useEffect(() => {
    setStep(hasThumbnail(mimeType) ? 0 : 2);
  }, [driveFileId, mimeType]);

  const Icon = ICONS[fileTypeKind(mimeType)];
  const src =
    step === 0
      ? driveThumbnailUrl(driveFileId, DRIVE_THUMBNAIL_WIDTH)
      : step === 1
        ? driveThumbnailFallbackUrl(driveFileId, DRIVE_THUMBNAIL_WIDTH)
        : null;

  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: 1,
        bgcolor: 'action.hover',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {src ? (
        <Box
          component="img"
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setStep((current) => current + 1)}
          sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <Icon color="action" sx={{ fontSize: Math.round(size * 0.55) }} aria-hidden />
      )}
    </Box>
  );
}
