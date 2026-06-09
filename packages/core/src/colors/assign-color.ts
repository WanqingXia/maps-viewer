import type { ColorHex } from '@maps-viewer/shared';
import { AUTO_PALETTE } from '@maps-viewer/shared';

/**
 * Deterministic color cycler.
 *
 * Cycles through indices 0..19 of the 22-color palette — the first 20
 * "auto" colors. Indices 20 (white) and 21 (black) are reserved for
 * manual user override and never returned by `assignColor`.
 *
 * Usage: pass the *current* number of layers/groups in state and use the
 * result as the next color. The cycle wraps cleanly at 20.
 */
export function assignColor(usedCount: number): ColorHex {
  const n = AUTO_PALETTE.length;
  const idx = ((usedCount % n) + n) % n;
  return AUTO_PALETTE[idx]!;
}

/**
 * Pick the first auto-palette color that is not already present in the
 * supplied color list. Falls back to the deterministic cycle when every
 * auto color is already in use.
 */
export function assignUnusedColor(usedColors: Iterable<string>, fallbackIndex: number): ColorHex {
  const used = new Set([...usedColors].map((color) => color.toLowerCase()));
  const available = AUTO_PALETTE.find((color) => !used.has(color.toLowerCase()));
  return available ?? assignColor(fallbackIndex);
}
