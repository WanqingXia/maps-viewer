import type { Layer, ColorHex } from '@maps-viewer/shared';
import type { FeatureCollection, Feature, Geometry, Position } from 'geojson';
import { HOVER_COLOR } from '@maps-viewer/shared';

/**
 * Internal property names we stamp on each feature for point-render collapse.
 */
const SIZE_M_PROP = 'mv_sizeM';
const COLLAPSE_ZOOM_PROP = 'mv_collapseZoom';

/** Features smaller than this many screen pixels collapse to a fixed dot. */
const COLLAPSE_THRESHOLD_PX = 20;
const MERCATOR_M_PER_PIXEL_Z0 = 156543.03392;
const MAX_STYLE_ZOOM = 24;
const DOT_RADIUS = 4;
const DOT_SOURCE_SUFFIX = '-dot-source';

export function dotSourceId(layerId: string): string {
  return `${layerId}${DOT_SOURCE_SUFFIX}`;
}

export function layerIdFromDotSource(sourceId: string): string | null {
  return sourceId.endsWith(DOT_SOURCE_SUFFIX) ? sourceId.slice(0, -DOT_SOURCE_SUFFIX.length) : null;
}

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
  pointRenderEnabled = false,
): void {
  if (!map.getSource(layer.id)) {
    stampFeatureSizes(geojson);
    map.addSource(layer.id, {
      type: 'geojson',
      data: geojson,
      generateId: true,
    });
  }
  if (!map.getSource(dotSourceId(layer.id))) {
    map.addSource(dotSourceId(layer.id), {
      type: 'geojson',
      data: collapsedDotSource(geojson),
    });
  }

  const color: ColorHex = layer.color;
  const strokeWidth = layer.strokeWidth;
  const visibility = layer.visible ? 'visible' : 'none';
  const dotVisibility = layer.visible && pointRenderEnabled ? 'visible' : 'none';

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
      source: dotSourceId(layer.id),
      layout: { visibility: dotVisibility },
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
  collapsedFeatureIds: ReadonlySet<number | string> = new Set(),
): unknown {
  const base = baseSublayerFilter(kind);
  const clauses: unknown[] = ['all', base];
  if (hiddenFeatureIds.size > 0) clauses.push(notInIds(hiddenFeatureIds));
  if (kind === 'dot') {
    clauses.push(inIds(collapsedFeatureIds));
  } else if (kind === 'fill' || kind === 'line') {
    clauses.push(notInIds(collapsedFeatureIds));
  }
  return clauses.length === 2 ? base : clauses;
}

export function sublayerKindFromId(layerId: string, sublayerId: string): SublayerKind | null {
  const suffix = sublayerId.slice(layerId.length + 1);
  return suffix === 'fill' || suffix === 'line' || suffix === 'point' || suffix === 'dot' ? suffix : null;
}

function baseSublayerFilter(kind: SublayerKind): unknown {
  switch (kind) {
    case 'fill':
      return ['==', '$type', 'Polygon'];
    case 'line':
      return ['in', '$type', 'LineString', 'Polygon'];
    case 'point':
      return ['==', '$type', 'Point'];
    case 'dot':
      return ['has', COLLAPSE_ZOOM_PROP];
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
 * Mutate each feature in place to add collapse metadata for point rendering.
 *
 * The collapse rule is screen-space driven: compute a feature bbox size in
 * meters, then precompute the zoom below which that size is under the pixel
 * threshold. Native Point/MultiPoint features keep their normal point layer.
 */
function stampFeatureSizes(geojson: FeatureCollection): void {
  for (const f of geojson.features) {
    const props = (f.properties ?? {}) as Record<string, unknown>;
    const metrics = collapseMetrics(f.geometry);
    if (metrics) {
      props[SIZE_M_PROP] = metrics.sizeM;
      props[COLLAPSE_ZOOM_PROP] = metrics.collapseZoom;
    }
    f.properties = props;
  }
}

function collapsedDotSource(geojson: FeatureCollection): FeatureCollection {
  const features: Feature[] = [];
  for (let i = 0; i < geojson.features.length; i++) {
    const original = geojson.features[i]!;
    const geometry = original.geometry;
    if (!geometry || geometry.type === 'Point' || geometry.type === 'MultiPoint') continue;
    const metrics = collapseMetrics(geometry);
    if (!metrics) continue;
    const center = centerOfGeometry(geometry);
    if (!center) continue;
    features.push({
      type: 'Feature',
      id: i,
      properties: {
        ...(original.properties ?? {}),
        [SIZE_M_PROP]: metrics.sizeM,
        [COLLAPSE_ZOOM_PROP]: metrics.collapseZoom,
        mv_collapsedGeometryType: geometry.type,
      },
      geometry: { type: 'Point', coordinates: center },
    });
  }
  return { type: 'FeatureCollection', features };
}

export function collapseZoomOf(feature: Feature): number | null {
  const value = feature.properties?.[COLLAPSE_ZOOM_PROP];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function collapseMetrics(g: Geometry | null): { sizeM: number; collapseZoom: number } | null {
  if (!g || g.type === 'Point' || g.type === 'MultiPoint') return null;
  const bounds = boundsOfGeometry(g);
  if (!bounds) return null;
  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const widthM = haversineM(midLat, bounds.minLng, midLat, bounds.maxLng);
  const heightM = haversineM(bounds.minLat, bounds.minLng, bounds.maxLat, bounds.minLng);
  const sizeM = Math.max(widthM, heightM);
  if (sizeM <= 0) return null;
  const latitudeScale = Math.max(Math.cos(midLat * TO_RAD), 0.01);
  const rawZoom = Math.log2((COLLAPSE_THRESHOLD_PX * MERCATOR_M_PER_PIXEL_Z0 * latitudeScale) / sizeM);
  return { sizeM, collapseZoom: Math.max(0, Math.min(MAX_STYLE_ZOOM, rawZoom)) };
}

function centerOfGeometry(g: Geometry): [number, number] | null {
  const bounds = boundsOfGeometry(g);
  return bounds ? [(bounds.minLng + bounds.maxLng) / 2, (bounds.minLat + bounds.maxLat) / 2] : null;
}

function boundsOfGeometry(
  g: Geometry,
): { minLng: number; minLat: number; maxLng: number; maxLat: number } | null {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coordsOf(g)) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  return isFinite(minLng) ? { minLng, minLat, maxLng, maxLat } : null;
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

function inIds(ids: ReadonlySet<number | string>): unknown {
  if (ids.size === 0) return ['==', '$id', '__mv_no_match__'];
  return ['in', '$id', ...ids];
}

function notInIds(ids: ReadonlySet<number | string>): unknown {
  if (ids.size === 0) return ['!=', '$id', '__mv_no_match__'];
  return ['!in', '$id', ...ids];
}
