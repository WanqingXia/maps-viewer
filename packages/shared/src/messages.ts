import type { FeatureCollection } from 'geojson';
import type { LayerState, LayerAction, UserAction } from './layer.js';
import type { CountryCode } from './country.js';
import type { ProjectCameraState } from './project.js';

export type Basemap = 'standard' | 'satellite';

/**
 * GeoJSON content keyed by `Layer.id`. Sent at `init` for all initial
 * layers, and at `applyAction` only when the action adds a layer.
 * Subsequent mutations (color, stroke, visibility, rename, group) do not
 * re-ship payloads — the webview already has them.
 */
export type LayerDataMap = Record<string, FeatureCollection>;

/**
 * Per-layer primary key. Used by Locate to build a quick-pick list and to
 * resolve a PK value back to a Mapbox feature id.
 */
export type PrimaryKeyMap = Record<string, string>;

/** Messages posted by the extension host into the webview. */
export type HostMessage =
  | {
      readonly type: 'init';
      readonly mapboxToken: string;
      readonly state: LayerState;
      readonly layerData: LayerDataMap;
      readonly basemap: Basemap;
      readonly country?: CountryCode;
      readonly primaryKeyByLayer?: PrimaryKeyMap;
      readonly camera?: ProjectCameraState;
    }
  | {
      readonly type: 'applyAction';
      readonly action: LayerAction;
      readonly layerData?: LayerDataMap;
    }
  | { readonly type: 'setBasemap'; readonly basemap: Basemap }
  | { readonly type: 'setCountry'; readonly country: CountryCode | null }
  | { readonly type: 'setPrimaryKey'; readonly layerId: string; readonly key: string | null }
  | { readonly type: 'setCamera'; readonly camera: ProjectCameraState }
  | {
      readonly type: 'locate';
      readonly layerId: string;
      /** Mapbox feature id (matches `generateId: true` ordering). */
      readonly featureId: number;
      /** Centroid in [lng, lat] for the flyTo target. */
      readonly center: readonly [number, number];
      /** Optional zoom target; defaults to a sensible value on the webview side. */
      readonly zoom?: number;
    }
  | { readonly type: 'requestCameraState'; readonly requestId: string };

/** Messages posted by the webview back to the extension host. */
export type WebviewMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'mapLoaded' }
  | { readonly type: 'requestAction'; readonly action: UserAction }
  | { readonly type: 'cameraState'; readonly requestId: string; readonly camera: ProjectCameraState }
  | { readonly type: 'error'; readonly message: string; readonly code?: string };

/** Schema version for the postMessage protocol; bump on breaking changes. */
export const POST_MESSAGE_VERSION = 3;
