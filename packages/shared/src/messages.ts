import type { FeatureCollection } from 'geojson';
import type { ColorHex } from './colors.js';

/**
 * Layer descriptor for a single GeoJSON dataset on the map.
 *
 * Phase 1 always sends one `LayerInit` per file open. Phase 2 extends this
 * model with grouping and per-layer mutation actions.
 */
export interface LayerInit {
  readonly layerId: string;
  readonly fileName: string;
  readonly geojson: FeatureCollection;
  readonly color: ColorHex;
  readonly strokeWidth: number;
}

export type Basemap = 'standard' | 'satellite';

/** Messages posted by the extension host into the webview. */
export type HostMessage =
  | { type: 'init'; mapboxToken: string; layers: ReadonlyArray<LayerInit>; basemap: Basemap }
  | { type: 'setBasemap'; basemap: Basemap };

/** Messages posted by the webview back to the extension host. */
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'mapLoaded' }
  | { type: 'error'; message: string; code?: string };

/** Schema version for the postMessage protocol; bump on breaking changes. */
export const POST_MESSAGE_VERSION = 1;
