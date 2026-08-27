// Square-crop compression: images are center-cropped 1:1 before scaling to
// ≤320px WebP, and never upscaled — parity with the Android image pipeline.

import { compressImageToWebP } from '@/lib/images/compress';

interface FakeCanvas {
  width: number;
  height: number;
  getContext: () => { drawImage: (...args: unknown[]) => void };
  toBlob: (cb: (blob: Blob | null) => void, type?: string, quality?: number) => void;
}

describe('compressImageToWebP', () => {
  let drawArgs: unknown[] | null;
  let canvas: FakeCanvas;
  let blobType: string | undefined;
  let blobQuality: number | undefined;
  let nextImageSize: { w: number; h: number };

  beforeEach(() => {
    drawArgs = null;
    blobType = undefined;
    blobQuality = undefined;
    nextImageSize = { w: 0, h: 0 };

    canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: (...args: unknown[]) => {
          drawArgs = args;
        },
      }),
      toBlob: (cb, type, quality) => {
        blobType = type;
        blobQuality = quality;
        cb(new Blob(['x'], { type: 'image/webp' }));
      },
    };

    const realCreateElement = document.createElement.bind(document);
    jest
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) =>
        tag === 'canvas' ? (canvas as unknown as HTMLElement) : realCreateElement(tag),
      );

    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 0;
      height = 0;
      set src(_value: string) {
        this.width = nextImageSize.w;
        this.height = nextImageSize.h;
        queueMicrotask(() => this.onload?.());
      }
    }
    (globalThis as Record<string, unknown>).Image = FakeImage;
    globalThis.URL.createObjectURL = jest.fn(() => 'blob:mock');
    globalThis.URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function file(): File {
    return new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
  }

  it('center-crops a landscape image to a 320px square', async () => {
    nextImageSize = { w: 640, h: 480 };
    await compressImageToWebP(file());
    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(320);
    // Source crop: centered 480x480 square offset by (640-480)/2 = 80 on x.
    expect(drawArgs?.slice(1)).toEqual([80, 0, 480, 480, 0, 0, 320, 320]);
  });

  it('center-crops a portrait image with the offset on y', async () => {
    nextImageSize = { w: 480, h: 640 };
    await compressImageToWebP(file());
    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(320);
    expect(drawArgs?.slice(1)).toEqual([0, 80, 480, 480, 0, 0, 320, 320]);
  });

  it('never upscales a small image', async () => {
    nextImageSize = { w: 100, h: 50 };
    await compressImageToWebP(file());
    expect(canvas.width).toBe(50);
    expect(canvas.height).toBe(50);
    expect(drawArgs?.slice(1)).toEqual([25, 0, 50, 50, 0, 0, 50, 50]);
  });

  it('encodes WebP at quality 0.8', async () => {
    nextImageSize = { w: 640, h: 640 };
    const blob = await compressImageToWebP(file());
    expect(blobType).toBe('image/webp');
    expect(blobQuality).toBe(0.8);
    expect(blob.type).toBe('image/webp');
  });
});
