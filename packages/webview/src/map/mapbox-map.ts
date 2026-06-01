import type { LayerInit, Basemap, WebviewMessage } from '@maps-viewer/shared';
import { renderLayer, sublayerIds } from './render-layer.js';
import { wireHover } from './hover.js';
import { mountBasemapToggle } from '../ui/basemap-toggle.js';
import { mountPropertiesPopup } from '../ui/properties-popup.js';

const STYLES = {
  standard: 'mapbox://styles/mapbox/streets-v12',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
} as const satisfies Record<Basemap, string>;

/**
 * Owns the Mapbox map instance + per-layer state. The webview entry constructs
 * exactly one of these per init and delegates all subsequent operations.
 *
 * `setBasemap` swaps the style; Mapbox drops user-added sources/layers on
 * style swap, so we re-add everything in the `style.load` handler.
 */
export class MapboxMap {
  private readonly map: unknown;
  private readonly layers: LayerInit[] = [];
  private readonly popup;
  private currentBasemap: Basemap;

  constructor(
    container: HTMLElement,
    basemap: Basemap,
    private readonly send: (m: WebviewMessage) => void,
  ) {
    this.currentBasemap = basemap;
    this.popup = mountPropertiesPopup(container);

    this.map = new window.mapboxgl.Map({
      container,
      style: STYLES[basemap],
      center: [0, 0],
      zoom: 1,
      projection: 'mercator',
      attributionControl: true,
    });

    (this.map as { addControl(c: unknown, p?: string): void }).addControl(
      new window.mapboxgl.NavigationControl({ visualizePitch: false }),
      'bottom-right',
    );

    mountBasemapToggle(container, basemap, (next) => this.setBasemap(next));
  }

  whenReady(fn: () => void): void {
    const m = this.map as { loaded(): boolean; on(e: string, h: () => void): void };
    if (m.loaded()) fn();
    else m.on('load', fn);
  }

  addLayer(layer: LayerInit): void {
    this.layers.push(layer);
    renderLayer(this.map as never, layer);
    wireHover(this.map, layer.layerId, this.popup);
    this.fitToLayers();
  }

  setBasemap(next: Basemap): void {
    if (next === this.currentBasemap) return;
    this.currentBasemap = next;
    const m = this.map as {
      setStyle(s: string): void;
      once(e: string, h: () => void): void;
    };
    m.setStyle(STYLES[next]);
    m.once('style.load', () => {
      for (const layer of this.layers) {
        renderLayer(this.map as never, layer);
        wireHover(this.map, layer.layerId, this.popup);
      }
    });
  }

  notifyMapLoaded(): void {
    this.send({ type: 'mapLoaded' });
  }

  private fitToLayers(): void {
    const bounds = new window.mapboxgl.LngLatBounds();
    for (const layer of this.layers) {
      for (const feature of layer.geojson.features) {
        extendBoundsWithGeometry(bounds, feature.geometry);
      }
    }
    if (bounds.isEmpty()) return;
    (this.map as { fitBounds(b: unknown, o?: Record<string, unknown>): void }).fitBounds(bounds, {
      padding: 40,
      animate: false,
      maxZoom: 14,
    });
  }
}

function extendBoundsWithGeometry(bounds: { extend(c: [number, number]): unknown }, geom: GeoJSON.Geometry | null): void {
  if (!geom) return;
  switch (geom.type) {
    case 'Point':
      bounds.extend(geom.coordinates as [number, number]);
      break;
    case 'MultiPoint':
    case 'LineString':
      for (const c of geom.coordinates) bounds.extend(c as [number, number]);
      break;
    case 'MultiLineString':
    case 'Polygon':
      for (const ring of geom.coordinates) for (const c of ring) bounds.extend(c as [number, number]);
      break;
    case 'MultiPolygon':
      for (const poly of geom.coordinates) for (const ring of poly) for (const c of ring) bounds.extend(c as [number, number]);
      break;
    case 'GeometryCollection':
      for (const sub of geom.geometries) extendBoundsWithGeometry(bounds, sub);
      break;
  }
}

// keep `sublayerIds` export usage tree-shake friendly across modules
void sublayerIds;
