/**
 * Mapbox GL JS is loaded via a separate <script nonce="..."> tag (the CSP-strict
 * UMD bundle), not bundled by Vite. This ambient declaration gives us a usable
 * `window.mapboxgl` typed surface without pulling the package into our bundle.
 *
 * All interfaces are declared at GLOBAL scope so consumer files don't have to
 * import them — they reference `MapboxMapInstance`, `MapboxPopupInstance`, etc.
 * directly. This is intentional for a tiny ambient surface; broader types
 * should be imported normally.
 */

declare global {
  interface Window {
    mapboxgl: MapboxGlobal;
    __MAPBOX_WORKER_URL__: string;
  }

  interface MapboxGlobal {
    accessToken: string;
    workerUrl: string;
    Map: new (options: Record<string, unknown>) => MapboxMapInstance;
    NavigationControl: new (options?: Record<string, unknown>) => unknown;
    Popup: new (options?: Record<string, unknown>) => MapboxPopupInstance;
    LngLatBounds: new (sw?: [number, number], ne?: [number, number]) => MapboxLngLatBoundsInstance;
  }

  interface MapboxMapInstance {
    on(event: string, layerOrHandler: string | ((e: unknown) => void), handler?: (e: unknown) => void): void;
    once(event: string, handler: (e: unknown) => void): void;
    off(event: string, layerOrHandler: string | ((e: unknown) => void), handler?: (e: unknown) => void): void;
    addSource(id: string, source: Record<string, unknown>): void;
    removeSource(id: string): void;
    getSource(id: string): unknown;
    addLayer(layer: Record<string, unknown>): void;
    removeLayer(id: string): void;
    getLayer(id: string): unknown;
    setStyle(style: string): void;
    setPaintProperty(layerId: string, name: string, value: unknown): void;
    setLayoutProperty(layerId: string, name: string, value: unknown): void;
    setFilter(layerId: string, filter: unknown): void;
    setFeatureState(target: { source: string; id: string | number }, state: Record<string, unknown>): void;
    removeFeatureState(target: { source: string; id?: string | number }, key?: string): void;
    queryRenderedFeatures(point: [number, number] | Array<[number, number]>, options?: { layers?: string[] }): Array<MapboxQueriedFeature>;
    fitBounds(bounds: MapboxLngLatBoundsInstance | [[number, number], [number, number]], options?: Record<string, unknown>): void;
    jumpTo(options: Record<string, unknown>): void;
    flyTo(options: Record<string, unknown>): void;
    getCanvas(): HTMLCanvasElement;
    loaded(): boolean;
    addControl(control: unknown, position?: string): void;
    remove(): void;
  }

  interface MapboxQueriedFeature {
    id: string | number | undefined;
    source: string;
    sourceLayer?: string;
    properties: Record<string, unknown> | null;
    geometry: GeoJSON.Geometry;
    layer: { id: string };
  }

  interface MapboxPopupInstance {
    setLngLat(lngLat: [number, number]): MapboxPopupInstance;
    setHTML(html: string): MapboxPopupInstance;
    addTo(map: MapboxMapInstance): MapboxPopupInstance;
    remove(): void;
  }

  interface MapboxLngLatBoundsInstance {
    extend(coord: [number, number]): MapboxLngLatBoundsInstance;
    isEmpty(): boolean;
  }
}

export {};
