/**
 * Google Drive public image URL building (src/lib/images/drive.ts): item
 * photos render from Drive keyed on `drive_image_id` — primary thumbnail
 * endpoint, lh3 fallback host, and the /file/d/{id}/view full-view page
 * (same pattern as expense bill attachments).
 */
import {
  DRIVE_LIGHTBOX_WIDTH,
  DRIVE_THUMBNAIL_WIDTH,
  driveThumbnailFallbackUrl,
  driveThumbnailUrl,
  driveViewUrl,
} from '@/lib/images/drive';

const ID = '1PBXfGMt4AuAZGyMGvFpvdmHY5-K4azXi';

describe('driveThumbnailUrl', () => {
  it('builds the drive.google.com thumbnail endpoint at the default width', () => {
    expect(driveThumbnailUrl(ID)).toBe(
      `https://drive.google.com/thumbnail?id=${ID}&sz=w320`,
    );
    expect(DRIVE_THUMBNAIL_WIDTH).toBe(320);
  });

  it('supports an explicit width', () => {
    expect(driveThumbnailUrl(ID, 1024)).toBe(
      `https://drive.google.com/thumbnail?id=${ID}&sz=w1024`,
    );
  });

  it('URL-encodes the file id', () => {
    expect(driveThumbnailUrl('a b&c')).toBe(
      'https://drive.google.com/thumbnail?id=a%20b%26c&sz=w320',
    );
  });
});

describe('driveThumbnailFallbackUrl', () => {
  it('builds the lh3.googleusercontent.com host the primary redirects to', () => {
    expect(driveThumbnailFallbackUrl(ID)).toBe(
      `https://lh3.googleusercontent.com/d/${ID}=w320`,
    );
    expect(driveThumbnailFallbackUrl(ID, 640)).toBe(
      `https://lh3.googleusercontent.com/d/${ID}=w640`,
    );
  });

  it('URL-encodes the file id', () => {
    expect(driveThumbnailFallbackUrl('a/b')).toBe(
      'https://lh3.googleusercontent.com/d/a%2Fb=w320',
    );
  });
});

describe('driveViewUrl', () => {
  it('builds the /file/d/{id}/view page (bill-attachment pattern)', () => {
    expect(driveViewUrl(ID)).toBe(`https://drive.google.com/file/d/${ID}/view`);
  });
});

describe('lightbox large variant (DRIVE_LIGHTBOX_WIDTH)', () => {
  it('builds both ladder hosts at w1600 for the in-app lightbox', () => {
    expect(DRIVE_LIGHTBOX_WIDTH).toBe(1600);
    expect(driveThumbnailUrl(ID, DRIVE_LIGHTBOX_WIDTH)).toBe(
      `https://drive.google.com/thumbnail?id=${ID}&sz=w1600`,
    );
    expect(driveThumbnailFallbackUrl(ID, DRIVE_LIGHTBOX_WIDTH)).toBe(
      `https://lh3.googleusercontent.com/d/${ID}=w1600`,
    );
  });
});
