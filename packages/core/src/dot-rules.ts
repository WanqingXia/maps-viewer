/**
 * Tuning constants for the "render small features as a visible dot when
 * zoomed out" feature (PRD: feature length <100m AND zoom < 13 → dot).
 *
 * Why a dot at all: at low zoom levels, fill polygons collapse to sub-pixel
 * area and lines collapse to sub-pixel length, making small features
 * invisible. A constant-size circle ensures every record stays clickable.
 *
 * These are intentionally exposed as constants (not config) for Phase 4.
 * Phase 5+ may surface them as settings if real-world feedback demands.
 */

/** Threshold below which a feature is considered "small". Meters. */
export const SMALL_FEATURE_M = 100;

/**
 * Maximum zoom level at which dot-rendering kicks in. Mapbox zoom 13
 * corresponds to roughly 1cm = 500m on a typical screen — the PRD's
 * stated threshold.
 */
export const DOT_ZOOM_THRESHOLD = 13;

/** Pixel radius of the dot. Large enough to be tappable, small enough not to clutter. */
export const DOT_RADIUS_PX = 4;
