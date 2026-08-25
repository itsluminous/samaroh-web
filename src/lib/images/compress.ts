/**
 * Client-side image compression for inventory item photos: scale the longest
 * edge down to ≤320px and encode as WebP before uploading to Supabase Storage
 * (spec §4.3 — keeps the `inventory-images` bucket tiny).
 */

export const INVENTORY_IMAGE_MAX_DIMENSION = 320;
const WEBP_QUALITY = 0.8;

/** Returns null when the file is not an acceptable image, else an error-free pass. */
export function validateImageFile(file: File): boolean {
  const supported = ['image/jpeg', 'image/png', 'image/webp'];
  return supported.includes(file.type) && file.size <= 10 * 1024 * 1024;
}

/**
 * Compresses an image file to a ≤320px WebP blob using a canvas. Rejects when
 * the browser cannot decode the file or encode WebP.
 */
export async function compressImageToWebP(
  file: File,
  maxDimension: number = INVENTORY_IMAGE_MAX_DIMENSION,
): Promise<Blob> {
  const bitmap = await loadImage(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('canvas 2d context unavailable');
  }
  ctx.drawImage(bitmap, 0, 0, width, height);

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
