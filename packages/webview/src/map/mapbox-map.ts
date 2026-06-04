import type {
  Layer,
  LayerAction,
  LayerDataMap,
  WebviewMessage,
  Basemap,
  ProjectCameraState,
  CountryCode,
} from '@maps-viewer/shared';
import type { FeatureCollection } from 'geojson';
import {
  renderLayer,
  sublayerIds,
  hoverCase,
  iterateCoordinates,
  sublayerFilter,
  sublayerKindFromId,
  dotSourceId,
  layerIdFromDotSource,
  collapseZoomOf,
} from './render-layer.js';
import { wireHover } from './hover.js';
import { mountBasemapToggle, type BasemapToggle } from '../ui/basemap-toggle.js';
import { mountPropertiesPopup, type PropertiesPopup } from '../ui/properties-popup.js';
import { mountFeatureDetails, type FeatureDetails } from '../ui/feature-details.js';

const STYLES: Record<Basemap, string> = {
  standard: 'mapbox://styles/mapbox/streets-v12',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
};

const POINT_LOCATE_ZOOM_DEFAULT = 16;
const LOCATE_PULSE_MS = 1500;
const COUNTRY_VIEW_FACTOR = 2;

export class MapboxMap {
  private readonly map: MapboxMapInstance;
  private readonly layers = new Map<string, Layer>();
  private readonly layerData = new Map<string, FeatureCollection>();
  private readonly hoverDisposers = new Map<string, () => void>();
  private currentBasemap: Basemap;
  private readonly popup: PropertiesPopup;
  private readonly details: FeatureDetails;
  private readonly toggle: BasemapToggle;
  private readonly hiddenFeatureIds = new Map<string, Set<number | string>>();
  private readonly collapsedFeatureIds = new Map<string, Set<number | string>>();
  private selectedFeature: { layerId: string; featureId: number | string } | null = null;
  private pointRenderEnabled = false;

  constructor(
    container: HTMLElement,
    basemap: Basemap,
    private readonly send: (msg: WebviewMessage) => void,
  ) {
    this.currentBasemap = basemap;
    this.map = new window.mapboxgl.Map({
      container,
      style: STYLES[basemap],
      center: [0, 0],
      zoom: 1,
      projection: 'mercator',
      attributionControl: true,
    });
    this.map.addControl(new window.mapboxgl.NavigationControl({ visualizePitch: false }), 'bottom-right');
    this.popup = mountPropertiesPopup(container);
    this.details = mountFeatureDetails(
      container,
      () => this.zoomToSelectedFeature(),
    );
    this.toggle = mountBasemapToggle(container, basemap, (next) => this.setBasemap(next));
    this.map.on('error', (e: unknown) => {
      const detail = (e as { error?: { message?: string } }).error?.message ?? 'unknown';
      this.send({ type: 'error', message: `mapbox: ${detail}`, code: 'MAPBOX_ERROR' });
    });
    this.map.on('click', (event: unknown) => this.handleMapClick(event));
    this.map.on('zoom', () => this.updateCollapsedFeatureIds());
  }

  whenReady(fn: () => void): void {
    if (this.map.loaded()) fn();
    else this.map.once('load', fn);
  }

  notifyMapLoaded(): void {
    this.send({ type: 'mapLoaded' });
  }

  /** Phase-2 dispatcher (unchanged from Phase 2). */
  applyAction(action: LayerAction, layerData?: LayerDataMap): void {
    switch (action.type) {
      case 'addLayer': {
        const data = layerData?.[action.layer.id];
        if (!data) return;
        this.layers.set(action.layer.id, action.layer);
        this.layerData.set(action.layer.id, data);
        renderLayer(this.map, action.layer, data, this.pointRenderEnabled);
        const layerId = action.layer.id;
        const disposer = wireHover(
          this.map,
          layerId,
          this.popup,
          () => this.layers.get(layerId)?.displayName ?? action.layer.fileName,
        );
        this.hoverDisposers.set(layerId, disposer);
        this.updateCollapsedFeatureIds();
        this.fitToLayers();
        return;
      }
      case 'removeLayer': {
        this.hoverDisposers.get(action.layerId)?.();
        this.hoverDisposers.delete(action.layerId);
        for (const id of sublayerIds(action.layerId)) {
          if (this.map.getLayer(id)) this.map.removeLayer(id);
        }
        if (this.map.getSource(action.layerId)) this.map.removeSource(action.layerId);
        if (this.map.getSource(dotSourceId(action.layerId))) this.map.removeSource(dotSourceId(action.layerId));
        this.layers.delete(action.layerId);
        this.layerData.delete(action.layerId);
        this.collapsedFeatureIds.delete(action.layerId);
        return;
      }
      case 'setLayerColor': {
        const layer = this.layers.get(action.layerId);
        if (!layer) return;
        this.layers.set(action.layerId, { ...layer, color: action.color });
        this.repaintColor(action.layerId, action.color);
        return;
      }
      case 'setLayerStrokeWidth': {
        const layer = this.layers.get(action.layerId);
        if (!layer) return;
        this.layers.set(action.layerId, { ...layer, strokeWidth: action.width });
        this.repaintStroke(action.layerId, action.width);
        return;
      }
      case 'setLayerVisible': {
        const layer = this.layers.get(action.layerId);
        if (!layer) return;
        this.layers.set(action.layerId, { ...layer, visible: action.visible });
        this.repaintVisible(action.layerId, action.visible);
        return;
      }
      case 'renameLayer': {
        const layer = this.layers.get(action.layerId);
        if (!layer) return;
        const displayName = action.name.trim() === '' ? layer.fileName : action.name.trim();
        this.layers.set(action.layerId, { ...layer, displayName });
        return;
      }
      case 'createGroup': {
        for (const layerId of action.layerIds) {
          const layer = this.layers.get(layerId);
          if (!layer) continue;
          const next = { ...layer, groupId: action.group.id, color: action.group.color };
          this.layers.set(layerId, next);
          this.repaintColor(layerId, action.group.color);
        }
        return;
      }
      case 'setGroupColor':
        for (const [layerId, layer] of this.layers) {
          if (layer.groupId !== action.groupId) continue;
          this.layers.set(layerId, { ...layer, color: action.color });
          this.repaintColor(layerId, action.color);
        }
        return;
      case 'setGroupVisible':
        for (const [layerId, layer] of this.layers) {
          if (layer.groupId !== action.groupId) continue;
          this.layers.set(layerId, { ...layer, visible: action.visible });
          this.repaintVisible(layerId, action.visible);
        }
        return;
      case 'renameGroup':
        return;
      case 'deleteGroup':
        for (const [layerId, layer] of this.layers) {
          if (layer.groupId === action.groupId) {
            const color = action.restoredColors?.[layerId] ?? layer.color;
            this.layers.set(layerId, { ...layer, groupId: null, color });
            this.repaintColor(layerId, color);
          }
        }
        return;
      case 'addToGroup':
        for (const [layerId, layer] of this.layers) {
          if (layerId !== action.layerId) continue;
          this.layers.set(layerId, { ...layer, groupId: action.groupId });
        }
        return;
      case 'removeFromGroup':
        for (const [layerId, layer] of this.layers) {
          if (layerId !== action.layerId) continue;
          const color = action.color ?? layer.color;
          this.layers.set(layerId, { ...layer, groupId: null, color });
          this.repaintColor(layerId, color);
        }
        return;
      case 'moveLayer': {
        const layer = this.layers.get(action.layerId);
        if (!layer) return;
        const color = action.color ?? layer.color;
        this.layers.set(action.layerId, { ...layer, groupId: action.targetGroupId, color });
        this.repaintColor(action.layerId, color);
        return;
      }
    }
  }

  setBasemap(next: Basemap): void {
    if (next === this.currentBasemap) return;
    this.currentBasemap = next;
    this.toggle.set(next);
    for (const dispose of this.hoverDisposers.values()) dispose();
    this.hoverDisposers.clear();
    this.map.setStyle(STYLES[next]);
    this.map.once('style.load', () => {
      for (const [layerId, layer] of this.layers) {
        const data = this.layerData.get(layerId);
        if (!data) continue;
        renderLayer(this.map, layer, data, this.pointRenderEnabled);
        const id = layerId;
        const disposer = wireHover(
          this.map,
          id,
          this.popup,
          () => this.layers.get(id)?.displayName ?? layer.fileName,
        );
        this.hoverDisposers.set(id, disposer);
      }
      this.updateCollapsedFeatureIds();
    });
  }

  /**
   * Fit the camera to a country bounding box, or back to the world bbox
   * when `code === null`. Resolves the bbox via `findCountry` from core.
   * Imported here lazily? — we keep a tiny local table to avoid pulling
   * core into the bundle; mismatched codes fall back to world.
   */
  setCountry(code: CountryCode | null, bbox: readonly [number, number, number, number]): void {
    const bounds: [[number, number], [number, number]] = [[bbox[0], bbox[1]], [bbox[2], bbox[3]]];
    const countryViewBounds = code ? expandedBounds(bbox, COUNTRY_VIEW_FACTOR) : null;
    this.map.setMaxBounds(null);
    this.map.setMinZoom(0);
    this.map.fitBounds(
      bounds,
      { padding: 40, animate: true, duration: 600 },
    );
    if (!countryViewBounds) return;
    const countryCamera = this.map.cameraForBounds(countryViewBounds, { padding: 0 });
    if (typeof countryCamera.zoom === 'number') this.map.setMinZoom(countryCamera.zoom);
    this.map.setMaxBounds(countryViewBounds);
  }

  /**
   * Fly to a feature centroid, briefly flash the hover state for a
   * visual pulse, then clear. Host pre-computes featureId + center so the
   * webview never has to scan features for the PK value.
   */
  locate(layerId: string, featureId: number, center: readonly [number, number], zoom?: number): void {
    const feature = this.layerData.get(layerId)?.features[featureId];
    const bounds = feature ? boundsOfGeometry(feature.geometry) : null;
    if (bounds && !isPointBounds(bounds)) {
      this.map.fitBounds(
        [[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
        { padding: 72, animate: true, duration: 800 },
      );
    } else {
      this.map.flyTo({
        center: [center[0], center[1]],
        zoom: zoom ?? POINT_LOCATE_ZOOM_DEFAULT,
        duration: 800,
      });
    }
    try {
      this.map.setFeatureState({ source: layerId, id: featureId }, { hover: true });
    } catch {
      /* feature might not be loaded yet — pulse is best-effort */
    }
    window.setTimeout(() => {
      try {
        this.map.setFeatureState({ source: layerId, id: featureId }, { hover: false });
      } catch { /* noop */ }
    }, LOCATE_PULSE_MS);
  }

  /** Snapshot the current camera state — used for Project save. */
  getCameraState(): ProjectCameraState {
    const center = unwrapCenter(this.map);
    return {
      center,
      zoom: getZoom(this.map),
      bearing: getBearing(this.map),
      pitch: getPitch(this.map),
    };
  }

  /** Restore a camera (used at project open). Jumps without animation. */
  setCamera(camera: ProjectCameraState): void {
    this.map.jumpTo({
      center: [camera.center[0], camera.center[1]],
      zoom: camera.zoom,
      bearing: camera.bearing,
      pitch: camera.pitch,
    });
  }

  dispose(): void {
    for (const dispose of this.hoverDisposers.values()) dispose();
    this.hoverDisposers.clear();
    this.toggle.destroy();
    this.popup.destroy();
    this.details.destroy();
    this.map.remove();
  }

  setFeatureVisible(layerId: string, featureId: number | string, visible: boolean): void {
    const hidden = this.hiddenFeatureIds.get(layerId) ?? new Set<number | string>();
    if (visible) hidden.delete(featureId);
    else hidden.add(featureId);
    if (hidden.size === 0) this.hiddenFeatureIds.delete(layerId);
    else this.hiddenFeatureIds.set(layerId, hidden);
    this.repaintFeatureFilters(layerId);
    if (this.selectedFeature?.layerId === layerId && this.selectedFeature.featureId === featureId) {
      this.details.hide();
    }
  }

  setPointRender(enabled: boolean): void {
    this.pointRenderEnabled = enabled;
    this.updateCollapsedFeatureIds();
    for (const [layerId, layer] of this.layers) {
      const dot = `${layerId}-dot`;
      if (this.map.getLayer(dot)) {
        this.map.setLayoutProperty(dot, 'visibility', this.dotVisibility(layer));
      }
    }
  }

  private repaintColor(layerId: string, color: Layer['color']): void {
    const fill = `${layerId}-fill`;
    const line = `${layerId}-line`;
    const point = `${layerId}-point`;
    const dot = `${layerId}-dot`;
    if (this.map.getLayer(fill)) this.map.setPaintProperty(fill, 'fill-color', hoverCase(color));
    if (this.map.getLayer(line)) this.map.setPaintProperty(line, 'line-color', hoverCase(color));
    if (this.map.getLayer(point)) this.map.setPaintProperty(point, 'circle-color', hoverCase(color));
    if (this.map.getLayer(dot)) this.map.setPaintProperty(dot, 'circle-color', hoverCase(color));
  }

  private repaintStroke(layerId: string, width: number): void {
    const line = `${layerId}-line`;
    const point = `${layerId}-point`;
    if (this.map.getLayer(line)) this.map.setPaintProperty(line, 'line-width', width);
    if (this.map.getLayer(point)) this.map.setPaintProperty(point, 'circle-radius', Math.max(width, 4));
    // -dot keeps its fixed radius regardless of stroke
  }

  private repaintVisible(layerId: string, visible: boolean): void {
    const layer = this.layers.get(layerId);
    const value = visible ? 'visible' : 'none';
    for (const id of sublayerIds(layerId)) {
      if (!this.map.getLayer(id)) continue;
      const isDot = id === `${layerId}-dot`;
      this.map.setLayoutProperty(id, 'visibility', isDot && layer ? this.dotVisibility(layer) : value);
    }
  }

  private dotVisibility(layer: Layer): 'visible' | 'none' {
    return layer.visible && this.pointRenderEnabled ? 'visible' : 'none';
  }

  private repaintFeatureFilters(layerId: string): void {
    const hidden = this.hiddenFeatureIds.get(layerId) ?? new Set<number | string>();
    const collapsed = this.collapsedFeatureIds.get(layerId) ?? new Set<number | string>();
    for (const sublayerId of sublayerIds(layerId)) {
      const kind = sublayerKindFromId(layerId, sublayerId);
      if (kind && this.map.getLayer(sublayerId)) {
        this.map.setFilter(sublayerId, sublayerFilter(layerId, kind, hidden, collapsed));
      }
    }
  }

  private updateCollapsedFeatureIds(): void {
    if (!this.pointRenderEnabled) {
      if (this.collapsedFeatureIds.size === 0) return;
      this.collapsedFeatureIds.clear();
      for (const layerId of this.layers.keys()) this.repaintFeatureFilters(layerId);
      return;
    }
    const zoom = getZoom(this.map);
    for (const [layerId, data] of this.layerData) {
      const collapsed = new Set<number | string>();
      for (let i = 0; i < data.features.length; i++) {
        const collapseZoom = collapseZoomOf(data.features[i]!);
        if (collapseZoom !== null && zoom < collapseZoom) collapsed.add(i);
      }
      if (collapsed.size === 0) this.collapsedFeatureIds.delete(layerId);
      else this.collapsedFeatureIds.set(layerId, collapsed);
      this.repaintFeatureFilters(layerId);
    }
  }

  private handleMapClick(event: unknown): void {
    const point = (event as { point?: { x: number; y: number } }).point;
    if (!point) return;
    const layers = [...this.layers.keys()].flatMap((layerId) => [...sublayerIds(layerId)]);
    const features = this.map.queryRenderedFeatures([point.x, point.y], { layers });
    const feature = features.find((f) => f.id !== undefined);
    if (!feature || feature.id === undefined) {
      this.selectedFeature = null;
      this.details.hide();
      return;
    }
    const layerId = this.layerIdForFeatureSource(feature.source);
    const layer = this.layers.get(layerId);
    if (!layer) return;
    this.selectedFeature = { layerId, featureId: feature.id };
    this.details.show({
      layerName: layer.displayName,
      featureId: feature.id,
      properties: feature.properties,
    });
  }

  private layerIdForFeatureSource(source: string): string {
    return this.layers.has(source) ? source : layerIdFromDotSource(source) ?? source;
  }

  private zoomToSelectedFeature(): void {
    if (!this.selectedFeature) return;
    const id = Number(this.selectedFeature.featureId);
    if (!Number.isInteger(id)) return;
    const feature = this.layerData.get(this.selectedFeature.layerId)?.features[id];
    const center = feature ? centerOfGeometry(feature.geometry) : null;
    if (!center) return;
    this.locate(this.selectedFeature.layerId, id, center);
  }

  private fitToLayers(): void {
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    let any = false;
    for (const data of this.layerData.values()) {
      for (const [lng, lat] of iterateCoordinates(data)) {
        any = true;
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
      }
    }
    if (!any || !isFinite(minLng)) return;
    if (minLng === maxLng && minLat === maxLat) {
      const pad = 0.0005;
      minLng -= pad; maxLng += pad; minLat -= pad; maxLat += pad;
    }
    this.map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 40, animate: false, duration: 0 });
  }
}

function boundsOfGeometry(g: GeoJSON.Geometry | null): [number, number, number, number] | null {
  if (!g) return null;
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coordsOfGeometry(g)) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  return isFinite(minLng) ? [minLng, minLat, maxLng, maxLat] : null;
}

function expandedBounds(
  bbox: readonly [number, number, number, number],
  factor: number,
): [[number, number], [number, number]] {
  const width = bbox[2] - bbox[0];
  const height = bbox[3] - bbox[1];
  const xPad = (width * (factor - 1)) / 2;
  const yPad = (height * (factor - 1)) / 2;
  return [
    [clampLng(bbox[0] - xPad), clampLat(bbox[1] - yPad)],
    [clampLng(bbox[2] + xPad), clampLat(bbox[3] + yPad)],
  ];
}

function clampLng(value: number): number {
  return Math.max(-180, Math.min(180, value));
}

function clampLat(value: number): number {
  return Math.max(-85, Math.min(85, value));
}

function centerOfGeometry(g: GeoJSON.Geometry | null): [number, number] | null {
  const bounds = boundsOfGeometry(g);
  return bounds ? [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2] : null;
}

function isPointBounds(bounds: [number, number, number, number]): boolean {
  return bounds[0] === bounds[2] && bounds[1] === bounds[3];
}

function* coordsOfGeometry(g: GeoJSON.Geometry): Generator<[number, number]> {
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
      for (const ring of g.coordinates as Array<Array<[number, number]>>) {
        for (const c of ring) yield c;
      }
      return;
    case 'MultiPolygon':
      for (const poly of g.coordinates as Array<Array<Array<[number, number]>>>) {
        for (const ring of poly) for (const c of ring) yield c;
      }
      return;
    case 'GeometryCollection':
      for (const inner of g.geometries) yield* coordsOfGeometry(inner);
      return;
  }
}

// === Tiny adapter helpers because our ambient typings are intentionally minimal ===
function unwrapCenter(map: MapboxMapInstance): [number, number] {
  const obj = (map as unknown as { getCenter(): { lng: number; lat: number; toArray?(): [number, number] } }).getCenter();
  if (typeof obj.toArray === 'function') return obj.toArray();
  return [obj.lng, obj.lat];
}
function getZoom(map: MapboxMapInstance): number {
  return (map as unknown as { getZoom(): number }).getZoom();
}
function getBearing(map: MapboxMapInstance): number {
  return (map as unknown as { getBearing(): number }).getBearing();
}
function getPitch(map: MapboxMapInstance): number {
  return (map as unknown as { getPitch(): number }).getPitch();
}
