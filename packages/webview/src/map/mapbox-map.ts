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
import { renderLayer, sublayerIds, hoverCase, iterateCoordinates } from './render-layer.js';
import { wireHover } from './hover.js';
import { mountBasemapToggle, type BasemapToggle } from '../ui/basemap-toggle.js';
import { mountPropertiesPopup, type PropertiesPopup } from '../ui/properties-popup.js';

const STYLES: Record<Basemap, string> = {
  standard: 'mapbox://styles/mapbox/streets-v12',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
};

const LOCATE_ZOOM_DEFAULT = 14;
const LOCATE_PULSE_MS = 1500;

export class MapboxMap {
  private readonly map: MapboxMapInstance;
  private readonly layers = new Map<string, Layer>();
  private readonly layerData = new Map<string, FeatureCollection>();
  private readonly hoverDisposers = new Map<string, () => void>();
  private currentBasemap: Basemap;
  private readonly popup: PropertiesPopup;
  private readonly toggle: BasemapToggle;

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
    this.toggle = mountBasemapToggle(container, basemap, (next) => this.setBasemap(next));
    this.map.on('error', (e: unknown) => {
      const detail = (e as { error?: { message?: string } }).error?.message ?? 'unknown';
      this.send({ type: 'error', message: `mapbox: ${detail}`, code: 'MAPBOX_ERROR' });
    });
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
        renderLayer(this.map, action.layer, data);
        const layerId = action.layer.id;
        const disposer = wireHover(
          this.map,
          layerId,
          this.popup,
          () => this.layers.get(layerId)?.displayName ?? action.layer.fileName,
        );
        this.hoverDisposers.set(layerId, disposer);
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
        this.layers.delete(action.layerId);
        this.layerData.delete(action.layerId);
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
      case 'setGroupColor':
      case 'setGroupVisible':
      case 'createGroup':
      case 'renameGroup':
      case 'deleteGroup':
      case 'addToGroup':
      case 'removeFromGroup':
        return;
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
        renderLayer(this.map, layer, data);
        const id = layerId;
        const disposer = wireHover(
          this.map,
          id,
          this.popup,
          () => this.layers.get(id)?.displayName ?? layer.fileName,
        );
        this.hoverDisposers.set(id, disposer);
      }
    });
  }

  /**
   * Fit the camera to a country bounding box, or back to the world bbox
   * when `code === null`. Resolves the bbox via `findCountry` from core.
   * Imported here lazily? — we keep a tiny local table to avoid pulling
   * core into the bundle; mismatched codes fall back to world.
   */
  setCountry(code: CountryCode | null, bbox: readonly [number, number, number, number]): void {
    this.map.fitBounds(
      [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
      { padding: 40, animate: true, duration: 600 },
    );
    void code;
  }

  /**
   * Fly to a feature centroid, briefly flash the hover state for a
   * visual pulse, then clear. Host pre-computes featureId + center so the
   * webview never has to scan features for the PK value.
   */
  locate(layerId: string, featureId: number, center: readonly [number, number], zoom?: number): void {
    this.map.flyTo({
      center: [center[0], center[1]],
      zoom: zoom ?? LOCATE_ZOOM_DEFAULT,
      duration: 800,
    });
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
    this.map.remove();
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
    const value = visible ? 'visible' : 'none';
    for (const id of sublayerIds(layerId)) {
      if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', value);
    }
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
