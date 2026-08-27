/**
 * Client-side image compression for inventory item photos: center-crop to a
 * 1:1 square, scale the edge down to ≤320px and encode as WebP before
 * uploading to Supabase Storage (spec §4.3 — keeps the `inventory-images`
 * bucket tiny and matches the square crop the Android app produces, so
 * synced photos render consistently in the rounded avatars).
 */

export const INVENTORY_IMAGE_MAX_DIMENSION = 320;
const WEBP_QUALITY = 0.8;

/** Returns null when the file is not an acceptable image, else an error-free pass. */
export function validateImageFile(file: File): boolean {
  const supported = ['image/jpeg', 'image/png', 'image/webp'];
  return supported.includes(file.type) && file.size <= 10 * 1024 * 1024;
}

/**
 * Compresses an image file to a ≤320px **square** WebP blob using a canvas:
 * the largest centered square is cropped from the source (offsets on the
 * longer axis), then scaled down — never up. Rejects when the browser cannot
 * decode the file or encode WebP.
 */
export async function compressImageToWebP(
  file: File,
  maxDimension: number = INVENTORY_IMAGE_MAX_DIMENSION,
): Promise<Blob> {
  const bitmap = await loadImage(file);
  // Largest centered square of the source image.
  const cropSide = Math.min(bitmap.width, bitmap.height);
  const sourceX = Math.round((bitmap.width - cropSide) / 2);
  const sourceY = Math.round((bitmap.height - cropSide) / 2);
  const targetSide = Math.max(1, Math.min(maxDimension, cropSide));

  const canvas = document.createElement('canvas');
  canvas.width = targetSide;
  canvas.height = targetSide;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('canvas 2d context unavailable');
  }
  ctx.drawImage(bitmap, sourceX, sourceY, cropSide, cropSide, 0, 0, targetSide, targetSide);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('webp encoding failed'));
        }
      },
      'image/webp',
      WEBP_QUALITY,
    );
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image decode failed'));
    };
    img.src = url;
  });
}
