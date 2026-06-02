import type { ColorHex } from './colors.js';

/**
 * Layer state model (Phase 2).
 *
 * `Layer` is the persisted shape — describes how a GeoJSON file is rendered
 * (color, stroke, visibility, group membership) but does NOT carry the
 * GeoJSON content itself. GeoJSON travels separately via a
 * `Record<layerId, FeatureCollection>` in `init` + `applyAction` messages
 * so we don't re-ship multi-megabyte payloads for non-add actions.
 *
 * Conventions:
 *   - `Layer.id` is unique across the panel; webview-side feature ids are
 *     scoped per-layer via Mapbox's `generateId: true`.
 *   - `Layer.color` is the render color. Grouped layers track their group
 *     color and do not expose independent color controls in the UI.
 *   - `Layer.strokeWidth` is the line/circle stroke width (0–50; the
 *     reducer clamps).
 *   - `Layer.visible` is independent of group visibility; both must be
 *     true for the layer to render. Group visibility is enforced at the
 *     webview side by toggling each member layer.
 */
export interface Layer {
  readonly id: string;
  readonly fileName: string;
  readonly displayName: string;
  readonly sourcePath: string;
  readonly color: ColorHex;
  readonly strokeWidth: number;
  readonly visible: boolean;
  readonly groupId: string | null;
  readonly featureCount: number;
}

export interface Group {
  readonly id: string;
  readonly name: string;
  readonly color: ColorHex;
  readonly visible: boolean;
}

export interface LayerState {
  readonly layers: ReadonlyArray<Layer>;
  readonly groups: ReadonlyArray<Group>;
}

/**
 * All mutations to LayerState flow through this action set. The reducer
 * (in `@maps-viewer/core`) returns a new `LayerState` for each.
 *
 * `addLayer` always originates from the extension host (file IO lives
 * there). Other actions can originate from either side.
 */
export type LayerAction =
  | { readonly type: 'addLayer'; readonly layer: Layer }
  | { readonly type: 'removeLayer'; readonly layerId: string }
  | { readonly type: 'renameLayer'; readonly layerId: string; readonly name: string }
  | { readonly type: 'setLayerColor'; readonly layerId: string; readonly color: ColorHex }
  | { readonly type: 'setLayerStrokeWidth'; readonly layerId: string; readonly width: number }
  | { readonly type: 'setLayerVisible'; readonly layerId: string; readonly visible: boolean }
  | { readonly type: 'createGroup'; readonly group: Group; readonly layerIds: ReadonlyArray<string> }
  | { readonly type: 'renameGroup'; readonly groupId: string; readonly name: string }
  | { readonly type: 'setGroupColor'; readonly groupId: string; readonly color: ColorHex }
  | { readonly type: 'setGroupVisible'; readonly groupId: string; readonly visible: boolean }
  | { readonly type: 'deleteGroup'; readonly groupId: string; readonly restoredColors?: Readonly<Record<string, ColorHex>> }
  | { readonly type: 'addToGroup'; readonly layerId: string; readonly groupId: string }
  | { readonly type: 'removeFromGroup'; readonly layerId: string; readonly color?: ColorHex }
  | {
      readonly type: 'moveLayer';
      readonly layerId: string;
      readonly targetGroupId: string | null;
      readonly targetIndex: number;
      readonly color?: ColorHex;
    };

/** Subset of LayerAction that the webview UI can emit (no addLayer — file IO is host-side). */
export type UserAction = Exclude<LayerAction, { type: 'addLayer' }>;

export const EMPTY_LAYER_STATE: LayerState = { layers: [], groups: [] };

/** Stroke width bounds (PRD: 0–50, default 3). */
export const STROKE_WIDTH_MIN = 0;
export const STROKE_WIDTH_MAX = 50;
export const STROKE_WIDTH_DEFAULT = 3;
