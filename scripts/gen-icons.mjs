#!/usr/bin/env node
// Generates every web app icon from the canonical, cross-platform app icon
// shared/brand/app-icon.svg (the flat composite of the Android adaptive launcher icon:
// #6750A4 background + white three-arch foreground, 72dp visible window, rounded square).
// The web icon is therefore pixel-identical in artwork to the Android launcher icon.
//
// Outputs (all committed, so contributors/CI never need to run this):
//   public/icons/icon.svg               SVG favicon (modern browsers)
//   public/icons/favicon.ico            16 / 32 / 48 px frames (PNG-encoded ICO)
//   public/icons/icon-192.png           PWA manifest
//   public/icons/icon-512.png           PWA manifest
//   public/icons/maskable-512.png       PWA manifest, purpose=maskable (full-bleed, see below)
//   public/icons/apple-touch-icon.png   180 px, iOS home screen
//
// Usage: node scripts/gen-icons.mjs   (sharp is a pinned devDependency)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'shared/brand/app-icon.svg');
const FG = path.join(root, 'shared/brand/app-icon-foreground.svg');
const OUT = path.join(root, 'public/icons');

// Android adaptive-icon geometry (dp on the 108 grid).
const GRID = 108;
const SAFE_ZONE = 66; // Android safe-zone circle diameter
const BACKGROUND = '#6750A4'; // res/values/colors.xml ic_launcher_background

async function renderPng(svgBuffer, size) {
  return sharp(svgBuffer, { density: 384 }).resize(size, size).png().toBuffer();
}

/** Builds a .ico container whose entries are PNG-encoded frames (supported by all
 *  current browsers and by Windows since Vista). */
function buildIco(frames) {
  const HEADER = 6;
  const ENTRY = 16;
  const dir = Buffer.alloc(HEADER + ENTRY * frames.length);
  dir.writeUInt16LE(0, 0); // reserved
  dir.writeUInt16LE(1, 2); // type: icon
  dir.writeUInt16LE(frames.length, 4);
  let offset = dir.length;
  frames.forEach(({ size, png }, i) => {
    const e = HEADER + ENTRY * i;
    dir.writeUInt8(size === 256 ? 0 : size, e); // width
    dir.writeUInt8(size === 256 ? 0 : size, e + 1); // height
    dir.writeUInt8(0, e + 2); // palette
    dir.writeUInt8(0, e + 3); // reserved
    dir.writeUInt16LE(1, e + 4); // planes
    dir.writeUInt16LE(32, e + 6); // bpp
    dir.writeUInt32LE(png.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([dir, ...frames.map((f) => f.png)]);
}

/** Maskable PWA icon: the OS applies its own mask over the whole bitmap, so the icon is
 *  full-bleed background with the foreground placed so Android's 66dp safe zone maps onto
 *  the web "minimum safe zone" circle (80% of the edge) — same framing as a launcher. */
function maskableSvg(foregroundSvg) {
  const crop = SAFE_ZONE / 0.8; // 82.5dp of the 108 grid is visible
  const o = (GRID - crop) / 2;
  const inner = foregroundSvg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${o} ${o} ${crop} ${crop}" width="512" height="512">
  <rect x="0" y="0" width="${GRID}" height="${GRID}" fill="${BACKGROUND}"/>
  ${inner}
</svg>`;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const svg = await readFile(SRC);
  const fg = await readFile(FG, 'utf8');

  // SVG favicon: the canonical file, verbatim (keeps the comment trail + aria label).
  await writeFile(path.join(OUT, 'icon.svg'), svg);

  await writeFile(path.join(OUT, 'icon-192.png'), await renderPng(svg, 192));
  await writeFile(path.join(OUT, 'icon-512.png'), await renderPng(svg, 512));
  await writeFile(path.join(OUT, 'apple-touch-icon.png'), await renderPng(svg, 180));

  const icoFrames = [];
  for (const size of [16, 32, 48]) {
    icoFrames.push({ size, png: await renderPng(svg, size) });
  }
  await writeFile(path.join(OUT, 'favicon.ico'), buildIco(icoFrames));

  await writeFile(
    path.join(OUT, 'maskable-512.png'),
    await renderPng(Buffer.from(maskableSvg(fg)), 512),
  );

  console.log(`icons written to ${path.relative(root, OUT)}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
