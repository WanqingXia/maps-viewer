import type { LayerInit } from '@maps-viewer/shared';
import { HOVER_COLOR } from '@maps-viewer/shared';

/**
 * Add a GeoJSON source plus three sub-layers (fill / line / point) for one
 * `LayerInit`. Each sub-layer's color expression resolves to HOVER_COLOR when
 * the feature is in the `hover` feature-state, otherwise the layer color.
 *
 * Sub-layer ids follow `${layerId}-fill|line|point`; `removeLayer` and
 * hover-wire code rely on this naming convention.
 *
 * Source uses `generateId: true` so feature-state can target features by
 * Mapbox-generated numeric ids without per-feature `id` fields in the data.
 */
export function renderLayer(map: Window['mapboxgl']['Map'] extends new (...args: never) => infer M ? M : never, layer: LayerInit): void {
  const mapAny = map as unknown as {
    addSource: (id: string, src: Record<string, unknown>) => void;
    addLayer: (l: Record<string, unknown>) => void;
  };

  mapAny.addSource(layer.layerId, {
    type: 'geojson',
    data: layer.geojson,
    generateId: true,
  });

  const hoverCase = (fallback: string) => [
    'case', ['boolean', ['feature-state', 'hover'], false], HOVER_COLOR, fallback,
  ];

  mapAny.addLayer({
    id: `${layer.layerId}-fill`,
    type: 'fill',
    source: layer.layerId,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: {
      'fill-color': hoverCase(layer.color),
      'fill-opacity': 0.35,
    },
  });

  mapAny.addLayer({
    id: `${layer.layerId}-line`,
    type: 'line',
    source: layer.layerId,
    filter: ['any',
      ['==', ['geometry-type'], 'LineString'],
      ['==', ['geometry-type'], 'MultiLineString'],
      ['==', ['geometry-type'], 'Polygon'],
      ['==', ['geometry-type'], 'MultiPolygon'],
    ],
    paint: {
      'line-color': hoverCase(layer.color),
      'line-width': layer.strokeWidth,
    },
  });

  mapAny.addLayer({
    id: `${layer.layerId}-point`,
    type: 'circle',
    source: layer.layerId,
    filter: ['any',
      ['==', ['geometry-type'], 'Point'],
      ['==', ['geometry-type'], 'MultiPoint'],
    ],
    paint: {
      'circle-color': hoverCase(layer.color),
      'circle-radius': Math.max(layer.strokeWidth, 4),
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1,
    },
  });
}

/** Sub-layer ids written by `renderLayer`. Hover wiring queries these. */
export function sublayerIds(layerId: string): ReadonlyArray<string> {
  return [`${layerId}-fill`, `${layerId}-line`, `${layerId}-point`];
}
