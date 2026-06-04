/**
 * Tuning constants for Point Render: when enabled, line/polygon features
 * collapse into visible fixed-size dots only when their projected screen
 * footprint becomes too small at the current zoom.
 *
 * Why a dot at all: at low zoom levels, fill polygons collapse to sub-pixel
 * area and lines collapse to sub-pixel length, making small features
 * invisible. A constant-size circle ensures every record stays clickable.
 *
 * These are intentionally exposed as constants (not config) for the first
 * public release. Later releases may surface them as settings if real-world
 * feedback demands.
 */

/** Screen-size threshold below which a feature collapses to a dot. Pixels. */
export const COLLAPSE_THRESHOLD_PX = 10;

/** Maximum style zoom used when clamping precomputed collapse zooms. */
export const MAX_COLLAPSE_ZOOM = 24;

/** Pixel radius of the dot. Large enough to be tappable, small enough not to clutter. */
export const DOT_RADIUS_PX = 4;
