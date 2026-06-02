import type { CountryBbox, CountryCode } from '@maps-viewer/shared';
import bboxes from './country-bboxes.json' with { type: 'json' };

interface RawTable {
  readonly version: number;
  readonly countries: ReadonlyArray<{
    readonly code: string;
    readonly name: string;
    readonly bbox: readonly [number, number, number, number];
  }>;
}

/**
 * Curated bounding boxes for ~45 countries (PRD: top ~50). The table lives
 * in `country-bboxes.json` so it can be hand-maintained without recompile.
 *
 * Bbox is `[minLng, minLat, maxLng, maxLat]` (Mapbox convention).
 */
export const COUNTRY_BBOXES: ReadonlyArray<CountryBbox> = (bboxes as unknown as RawTable).countries;

/** O(1)-ish lookup by code (case-insensitive). Returns undefined if not in table. */
export function findCountry(code: CountryCode | string | null | undefined): CountryBbox | undefined {
  if (!code) return undefined;
  const upper = code.toUpperCase();
  return COUNTRY_BBOXES.find((c) => c.code === upper);
}

/** World bbox used when no country is selected. */
export const WORLD_BBOX: readonly [number, number, number, number] = [-180, -85, 180, 85];
