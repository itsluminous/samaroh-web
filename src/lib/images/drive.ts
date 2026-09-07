/**
 * Google Drive public image endpoints for item photos.
 *
 * The Supabase `inventory-images` bucket is gone — `drive_image_id` on
 * `master_items` is the authoritative photo reference (Android ADR-063;
 * `image_path` now carries device-local paths and is meaningless on web).
 * Files are shared anyone-with-link by the Android mirror/repair pass, so
 * they render through Drive's public endpoints with no auth:
 *
 * - Primary thumbnail: `https://drive.google.com/thumbnail?id={id}&sz=w{px}`
 *   Verified against an anyone-with-link file: 303-redirects to
 *   `lh3.googleusercontent.com/d/{id}={size}` and serves the image bytes.
 * - Fallback: `https://lh3.googleusercontent.com/d/{id}=w{px}` — the same
 *   backend the primary redirects to; retried on <img> error because the
 *   direct host occasionally rate-limits (403) independently.
 * - A NOT-yet-link-shared file redirects to a Google sign-in HTML page on
 *   both hosts → the <img> errors → callers fall back to the placeholder
 *   (the Android interstitial-guard case, until the owner's repair pass
 *   enables sharing).
 * - Full view: `https://drive.google.com/file/d/{id}/view` — the same
 *   pattern the expenses ledger already uses for bill attachments.
 */

/** Default thumbnail width (px) — matches the ≤320px upload convention. */
export const DRIVE_THUMBNAIL_WIDTH = 320;

/** Primary <img> src for an item photo stored in Drive. */
export function driveThumbnailUrl(
  driveImageId: string,
  width: number = DRIVE_THUMBNAIL_WIDTH,
): string {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveImageId)}&sz=w${width}`;
}

/** Fallback <img> src (the host the primary endpoint redirects to). */
export function driveThumbnailFallbackUrl(
  driveImageId: string,
  width: number = DRIVE_THUMBNAIL_WIDTH,
): string {
  return `https://lh3.googleusercontent.com/d/${encodeURIComponent(driveImageId)}=w${width}`;
}

/** Full-size view page (new tab) — same pattern as expense bill attachments. */
export function driveViewUrl(driveImageId: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(driveImageId)}/view`;
}
