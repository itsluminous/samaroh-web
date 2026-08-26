#!/usr/bin/env bash
# Generates the PWA icon set in public/icons/ from the shared brand mark
# (shared/brand/logo.svg — the single source of truth for the logo).
# Requires librsvg (`brew install librsvg`). The generated PNGs are committed
# so contributors and CI don't need librsvg; re-run after a logo change.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=shared/brand/logo.svg
OUT=public/icons
mkdir -p "$OUT"

rsvg-convert -w 192 -h 192 "$SRC" -o "$OUT/icon-192.png"
rsvg-convert -w 512 -h 512 "$SRC" -o "$OUT/icon-512.png"
rsvg-convert -w 180 -h 180 "$SRC" -o "$OUT/apple-touch-icon.png"

# Maskable variant: the mark scaled to the 80% safe zone on the brand color,
# so launcher masks (circle, squircle, …) never clip the artwork.
TMP=$(mktemp -t samaroh-maskable).svg
cat > "$TMP" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#6750A4"/>
  <image href="logo.svg" x="51" y="51" width="410" height="410"/>
</svg>
SVG
cp "$SRC" "$(dirname "$TMP")/logo.svg"
rsvg-convert -w 512 -h 512 "$TMP" -o "$OUT/maskable-512.png"
rm -f "$TMP" "$(dirname "$TMP")/logo.svg"

echo "icons written to $OUT"
