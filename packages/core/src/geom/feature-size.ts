import type { Feature, Geometry, Position } from 'geojson';

/**
 * Approximate "size" of a feature in meters.
 *
 * Used by the dot-rendering filter (`SMALL_FEATURE_M`). Definitions:
 *   - Point / MultiPoint        → 0 (already point-shaped; never collapsed to dot)
 *   - LineString / MultiLine    → total line length (meters)
 *   - Polygon / MultiPolygon    → max(bbox width, bbox height) in meters
 *   - GeometryCollection        → max over inner geometries
 *   - missing / unknown         → 0
 *
 * Implementation uses the haversine formula and a small "segment length"
 * helper. Self-contained — no turf dependency — to keep bundle size down.
 */
export function featureLenM(feature: Feature): number {
  if (!feature.geometry) return 0;
  return geometryLenM(feature.geometry);
}

function geometryLenM(g: Geometry): number {
  switch (g.type) {
    case 'Point':
    case 'MultiPoint':
      return 0;
    case 'LineString':
      return polylineLenM(g.coordinates);
    case 'MultiLineString':
      return g.coordinates.reduce((sum, line) => sum + polylineLenM(line), 0);
    case 'Polygon':
      return polygonSizeM(g.coordinates);
    case 'MultiPolygon': {
      let max = 0;
      for (const poly of g.coordinates) {
        const size = polygonSizeM(poly);
        if (size > max) max = size;
      }
      return max;
    }
    case 'GeometryCollection': {
      let max = 0;
      for (const inner of g.geometries) {
        const size = geometryLenM(inner);
        if (size > max) max = size;
      }
      return max;
    }
    default:
      return 0;
  }
}

function polylineLenM(coords: ReadonlyArray<Position>): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!;
    const b = coords[i]!;
    total += haversineM(a[1]!, a[0]!, b[1]!, b[0]!);
  }
  return total;
}

function polygonSizeM(rings: ReadonlyArray<ReadonlyArray<Position>>): number {
  if (rings.length === 0) return 0;
  const outer = rings[0]!;
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const p of outer) {
    const lng = p[0]!;
    const lat = p[1]!;
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  if (!isFinite(minLng)) return 0;
  const midLat = (minLat + maxLat) / 2;
  const widthM = haversineM(midLat, minLng, midLat, maxLng);
  const heightM = haversineM(minLat, minLng, maxLat, minLng);
  return Math.max(widthM, heightM);
}

const EARTH_RADIUS_M = 6371000;
const TO_RAD = Math.PI / 180;

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * TO_RAD;
  const dLng = (lng2 - lng1) * TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * TO_RAD) * Math.cos(lat2 * TO_RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}
