import type { Layer, ColorHex } from '@maps-viewer/shared';
import type { FeatureCollection, Feature, Geometry, Position } from 'geojson';
import { HOVER_COLOR } from '@maps-viewer/shared';

/**
 * Internal property name we stamp on each feature for the dot rule.
 * Mapbox filters can `['get', 'mv_lenM']` to read it.
 */
const LEN_PROP = 'mv_lenM';

/** PRD: features with length < 100m render as a dot at zoom < 13. */
const SMALL_M = 100;
const DOT_MAXZOOM = 13;
const DOT_RADIUS = 4;

/**
 * Add a layer's source + 4 sublayers (fill / line / point / dot) to the map.
 *
 * One source per layer with sublayers selected by `geometry-type` and (for
 * the dot sublayer) a length threshold + zoom maxzoom. Hover styling uses
 * Mapbox `feature-state` with `generateId: true` so we don't re-render on
 * every mousemove.
 *
 * Side effect: stamps `mv_lenM` onto each feature's properties (in place)
 * so the dot filter can read it. This mutation happens once at source
 * insertion; the feature objects are owned by us at this point.
 *
 * Idempotent: re-calling for an existing source/layer id is a no-op.
 */
export function renderLayer(
  map: MapboxMapInstance,
  layer: Layer,
  geojson: FeatureCollection,
): void {
  if (!map.getSource(layer.id)) {
    stampFeatureSizes(geojson);
    map.addSource(layer.id, {
      type: 'geojson',
      data: geojson,
      generateId: true,
    });
  }

  const color: ColorHex = layer.color;
  const strokeWidth = layer.strokeWidth;
  const visibility = layer.visible ? 'visible' : 'none';

  if (!map.getLayer(`${layer.id}-fill`)) {
    map.addLayer({
      id: `${layer.id}-fill`,
      type: 'fill',
      source: layer.id,
      layout: { visibility },
      filter: sublayerFilter(layer.id, 'fill'),
      paint: { 'fill-color': hoverCase(color), 'fill-opacity': 0.3 },
    });
  }
  if (!map.getLayer(`${layer.id}-line`)) {
    map.addLayer({
      id: `${layer.id}-line`,
      type: 'line',
      source: layer.id,
      layout: { visibility },
      filter: sublayerFilter(layer.id, 'line'),
      paint: { 'line-color': hoverCase(color), 'line-width': strokeWidth },
    });
  }
  if (!map.getLayer(`${layer.id}-point`)) {
    map.addLayer({
      id: `${layer.id}-point`,
      type: 'circle',
      source: layer.id,
      layout: { visibility },
      filter: sublayerFilter(layer.id, 'point'),
      paint: {
        'circle-color': hoverCase(color),
        'circle-radius': Math.max(strokeWidth, 4),
        'circle-stroke-width': 1,
        'circle-stroke-color': '#000',
      },
    });
  }
  // Phase-4 dot sublayer: visible only for small features at low zoom.
  // Native Points are already small/visible via `-point`, so we exclude them.
  if (!map.getLayer(`${layer.id}-dot`)) {
    map.addLayer({
      id: `${layer.id}-dot`,
      type: 'circle',
      source: layer.id,
      maxzoom: DOT_MAXZOOM,
      layout: { visibility },
      filter: sublayerFilter(layer.id, 'dot'),
      paint: {
        'circle-color': hoverCase(color),
        'circle-radius': DOT_RADIUS,
        'circle-stroke-width': 1,
        'circle-stroke-color': '#000',
      },
    });
  }
}

/** Sublayer ids for a given layer (4 sublayers per layer). */
export function sublayerIds(layerId: string): ReadonlyArray<string> {
  return [`${layerId}-fill`, `${layerId}-line`, `${layerId}-point`, `${layerId}-dot`];
}

export type SublayerKind = 'fill' | 'line' | 'point' | 'dot';

export function sublayerFilter(
  layerId: string,
  kind: SublayerKind,
  hiddenFeatureIds: ReadonlySet<number | string> = new Set(),
): unknown {
  const base = baseSublayerFilter(kind);
  if (hiddenFeatureIds.size === 0) return base;
  return [
    'all',
    base,
    ['!', ['in', ['id'], ['literal', [...hiddenFeatureIds]]]],
  ];
}

export function sublayerKindFromId(layerId: string, sublayerId: string): SublayerKind | null {
  const suffix = sublayerId.slice(layerId.length + 1);
  return suffix === 'fill' || suffix === 'line' || suffix === 'point' || suffix === 'dot' ? suffix : null;
}

function baseSublayerFilter(kind: SublayerKind): unknown {
  switch (kind) {
    case 'fill':
      return [
        'any',
        ['==', ['geometry-type'], 'Polygon'],
        ['==', ['geometry-type'], 'MultiPolygon'],
      ];
    case 'line':
      return [
        'any',
        ['==', ['geometry-type'], 'LineString'],
        ['==', ['geometry-type'], 'MultiLineString'],
        ['==', ['geometry-type'], 'Polygon'],
        ['==', ['geometry-type'], 'MultiPolygon'],
      ];
    case 'point':
      return [
        'any',
        ['==', ['geometry-type'], 'Point'],
        ['==', ['geometry-type'], 'MultiPoint'],
      ];
    case 'dot':
      return [
        'all',
        ['has', LEN_PROP],
        ['<', ['get', LEN_PROP], SMALL_M],
        ['!=', ['geometry-type'], 'Point'],
        ['!=', ['geometry-type'], 'MultiPoint'],
      ];
  }
}

/** Mapbox case expression that swaps to HOVER_COLOR when feature-state.hover is true. */
export function hoverCase(color: ColorHex): unknown {
  return ['case', ['boolean', ['feature-state', 'hover'], false], HOVER_COLOR, color];
}

/** Iterate every coordinate in a GeoJSON FeatureCollection (used by fitToLayers). */
export function* iterateCoordinates(geojson: FeatureCollection): Generator<[number, number]> {
  for (const feature of geojson.features) {
    yield* coordsOf(feature.geometry);
  }
}

function* coordsOf(geometry: Feature['geometry'] | null): Generator<[number, number]> {
  if (!geometry) return;
  const g = geometry as Geometry;
  switch (g.type) {
    case 'Point':
      yield g.coordinates as [number, number];
      return;
    case 'MultiPoint':
    case 'LineString':
      for (const c of g.coordinates as Array<[number, number]>) yield c;
      return;
    case 'MultiLineString':
    case 'Polygon':
      for (const ring of g.coordinates as Array<Array<[number, number]>>)
        for (const c of ring) yield c;
      return;
    case 'MultiPolygon':
      for (const poly of g.coordinates as Array<Array<Array<[number, number]>>>)
        for (const ring of poly) for (const c of ring) yield c;
      return;
    case 'GeometryCollection':
      for (const inner of g.geometries) yield* coordsOf(inner);
      return;
    default:
      return;
  }
}

/**
 * Mutate each feature in place to add `properties.mv_lenM` — the
 * approximate feature size in meters used by the dot filter.
 *
 * Heuristic identical to `@maps-viewer/core` `featureLenM`, inlined here
 * to avoid pulling the core dep into the webview bundle. Self-contained
 * haversine + bbox-size calculation.
 */
function stampFeatureSizes(geojson: FeatureCollection): void {
  for (const f of geojson.features) {
    const lenM = computeLenM(f.geometry);
    const props = (f.properties ?? {}) as Record<string, unknown>;
    props[LEN_PROP] = lenM;
    f.properties = props;
  }
}

function computeLenM(g: Geometry | null): number {
  if (!g) return 0;
  switch (g.type) {
    case 'Point':
    case 'MultiPoint':
      return 0;
    case 'LineString':
      return polylineLenM(g.coordinates);
    case 'MultiLineString':
      return g.coordinates.reduce((s, l) => s + polylineLenM(l), 0);
    case 'Polygon':
      return polygonSizeM(g.coordinates);
    case 'MultiPolygon': {
      let max = 0;
      for (const poly of g.coordinates) {
        const v = polygonSizeM(poly);
        if (v > max) max = v;
      }
      return max;
    }
    case 'GeometryCollection': {
      let max = 0;
      for (const inner of g.geometries) {
        const v = computeLenM(inner);
        if (v > max) max = v;
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
    const lng = p[0]!, lat = p[1]!;
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

const TO_RAD = Math.PI / 180;
const EARTH_R = 6371000;

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * TO_RAD;
  const dLng = (lng2 - lng1) * TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * TO_RAD) * Math.cos(lat2 * TO_RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(a));
}
