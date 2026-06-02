/**
 * ISO 3166-1 alpha-2 country code (uppercase, two letters).
 *
 * We do NOT enforce the alphabet at the type level — the runtime country
 * lookup just falls back to a no-op when the code isn't in our curated
 * table.
 */
export type CountryCode = string;

/**
 * Curated bounding box for a country.
 *
 * `bbox` is in Mapbox convention: `[minLng, minLat, maxLng, maxLat]`.
 * The table lives in `@maps-viewer/core` (data + loader).
 */
export interface CountryBbox {
  readonly code: CountryCode;
  readonly name: string;
  readonly bbox: readonly [number, number, number, number];
}
