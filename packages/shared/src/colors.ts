/**
 * The 20-color base palette from the PRD, plus white and black reserved for
 * manual user override.
 *
 * Index convention:
 *   - 0..19 are the auto-assigned cycle (see `assignColor` in @maps-viewer/core)
 *   - 20 (#ffffff) and 21 (#000000) are user-pickable but never auto-assigned
 *
 * Anything that picks "a color" should reference this constant rather than
 * inline hex literals so the palette stays single-source.
 */
export type ColorHex = `#${string}`;

export const PALETTE = [
  '#e6194b', '#3cb44b', '#ebbd4d', '#4363d8', '#f58231',
  '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe',
  '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000',
  '#aaffc3', '#808000', '#ffd8b1', '#000075', '#808080',
  // user-only overrides:
  '#ffffff', '#000000',
] as const satisfies ReadonlyArray<ColorHex>;

/** Auto-assignable subset (cycles through first 20 entries). */
export const AUTO_PALETTE = PALETTE.slice(0, 20) as ReadonlyArray<ColorHex>;

/** First color used when a layer is opened without an existing assignment. */
export const DEFAULT_LAYER_COLOR: ColorHex = PALETTE[0];

/** Color used for hover highlight, per PRD. */
export const HOVER_COLOR: ColorHex = '#FFFF00';
