#!/usr/bin/env bash
# Render resources/icon.svg → resources/icon.png at 256×256.
#
# Tries renderers in order of fidelity:
#   1. rsvg-convert  (most reliable; install via `brew install librsvg`)
#   2. inkscape      (also good)
#   3. qlmanage      (macOS built-in fallback)
#
# Exits 0 even if no renderer is found — the existing PNG (if any) is left
# in place so VSIX packaging doesn't break. The build emits a warning so
# the user knows to install a renderer when they're ready to ship.

set -e
cd "$(dirname "$0")/.."

SRC="resources/icon.svg"
OUT="resources/icon.png"
SIZE=256

if [ ! -f "$SRC" ]; then
  echo "[build-icon] $SRC not found; skipping"
  exit 0
fi

if command -v rsvg-convert >/dev/null 2>&1; then
  echo "[build-icon] using rsvg-convert"
  rsvg-convert -w "$SIZE" -h "$SIZE" "$SRC" -o "$OUT"
elif command -v inkscape >/dev/null 2>&1; then
  echo "[build-icon] using inkscape"
  inkscape "$SRC" --export-type=png --export-filename="$OUT" -w "$SIZE" -h "$SIZE"
elif command -v qlmanage >/dev/null 2>&1; then
  echo "[build-icon] using qlmanage (macOS fallback)"
  TMP=$(mktemp -d)
  qlmanage -t -s "$SIZE" -o "$TMP" "$SRC" >/dev/null 2>&1 || true
  if [ -f "$TMP/icon.svg.png" ]; then
    mv "$TMP/icon.svg.png" "$OUT"
  else
    echo "[build-icon] qlmanage failed to render SVG; leaving $OUT untouched"
    rm -rf "$TMP"
    exit 0
  fi
  rm -rf "$TMP"
else
  echo "[build-icon] no SVG renderer found (rsvg-convert / inkscape / qlmanage)."
  echo "[build-icon] install one (e.g. \`brew install librsvg\`) before publishing."
  exit 0
fi

if [ -f "$OUT" ]; then
  echo "[build-icon] wrote $OUT ($(wc -c < "$OUT") bytes)"
else
  echo "[build-icon] WARNING: no $OUT was produced"
fi
