/**
 * Webview entry point (Phase 3 + 4).
 *
 * Order of operations:
 *   1. Acquire the vscode webview API (single call, cached)
 *   2. Post {type:'ready'} so the extension host can flush its init
 *   3. Wait for {type:'init', ...} → bootstrap Mapbox, render initial layers,
 *      mount the LayersPanel sidebar with initial state, optionally apply
 *      country fit + camera restore from the project (Phase 3)
 *   4. Handle subsequent host messages:
 *        - applyAction → MapboxMap.applyAction + LayersPanel.update
 *        - setBasemap   → MapboxMap.setBasemap
 *        - setCountry   → MapboxMap.setCountry  (Phase 4)
 *        - setCamera    → MapboxMap.setCamera   (Phase 3)
 *        - locate       → MapboxMap.locate      (Phase 4)
 *        - requestCameraState → reply with `cameraState` (Phase 3)
 *        - setPrimaryKey → tracked locally for future PK-aware UI (no-op in this phase)
 */
import './styles.css';
import type {
  HostMessage,
  WebviewMessage,
  UserAction,
  LayerState,
} from '@maps-viewer/shared';
import { MapboxMap } from './map/mapbox-map.js';
import { mountLayersPanel, type LayersPanel } from './ui/layers-panel.js';

interface VsCodeApi { postMessage(msg: WebviewMessage): void }

declare const acquireVsCodeApi: undefined | (() => VsCodeApi);

function getVsCodeApi(): VsCodeApi | null {
  try {
    return typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
  } catch {
    return null;
  }
}

const vscode = getVsCodeApi();
const send = (m: WebviewMessage): void => { vscode?.postMessage(m); };

let map: MapboxMap | null = null;
let panel: LayersPanel | null = null;
let currentState: LayerState | null = null;

function ensureMapContainer(): HTMLElement {
  let el = document.getElementById('map');
  if (!el) {
    el = document.createElement('div');
    el.id = 'map';
    document.body.appendChild(el);
  }
  return el;
}

function ensurePanelContainer(): HTMLElement {
  let el = document.getElementById('panel-host');
  if (!el) {
    el = document.createElement('div');
    el.id = 'panel-host';
    document.body.appendChild(el);
  }
  return el;
}

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;

  try {
    switch (msg.type) {
      case 'init':
        void handleInit(msg).catch((err) => {
          send({
            type: 'error',
            message: err instanceof Error ? err.message : String(err),
            code: 'INIT_FAIL',
          });
        });
        return;
      case 'setBasemap':
        if (map) map.setBasemap(msg.basemap);
        return;
      case 'applyAction':
        if (map) handleApplyAction(msg);
        return;
      case 'setCountry':
        if (map) handleSetCountry(msg.country);
        return;
      case 'setCamera':
        if (map) map.setCamera(msg.camera);
        return;
      case 'locate':
        if (map) map.locate(msg.layerId, msg.featureId, msg.center, msg.zoom);
        return;
      case 'requestCameraState':
        if (map) {
          send({ type: 'cameraState', requestId: msg.requestId, camera: map.getCameraState() });
        }
        return;
      case 'setPrimaryKey':
        // Phase-4 stub: PK is currently host-only state (used to build the
        // Locate quick-pick). No UI consumer in the webview yet — kept as
        // a no-op so future LayersPanel can surface PK badges.
        return;
    }
  } catch (err) {
    send({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
      code: 'HANDLE_FAIL',
    });
  }
});

async function makeSameOriginWorkerUrl(remoteUrl: string): Promise<string> {
  const response = await fetch(remoteUrl);
  if (!response.ok) throw new Error(`fetch worker: ${response.status} ${response.statusText}`);
  const source = await response.text();
  return URL.createObjectURL(new Blob([source], { type: 'application/javascript' }));
}

async function handleInit(msg: Extract<HostMessage, { type: 'init' }>): Promise<void> {
  const mapContainer = ensureMapContainer();
  const panelContainer = ensurePanelContainer();

  if (!window.mapboxgl) {
    send({ type: 'error', message: 'mapbox-gl not loaded', code: 'NO_MAPBOX' });
    return;
  }
  window.mapboxgl.accessToken = msg.mapboxToken;
  if (window.__MAPBOX_WORKER_URL__) {
    window.mapboxgl.workerUrl = await makeSameOriginWorkerUrl(window.__MAPBOX_WORKER_URL__);
  }

  if (map) { map.dispose(); map = null; }
  if (panel) { panel.destroy(); panel = null; }

  map = new MapboxMap(mapContainer, msg.basemap, send);
  currentState = msg.state;

  panel = mountLayersPanel(panelContainer, msg.state, (action: UserAction) => {
    send({ type: 'requestAction', action });
  });

  map.whenReady(() => {
    if (!map) return;
    for (const layer of msg.state.layers) {
      const data = msg.layerData[layer.id];
      if (!data) continue;
      map.applyAction({ type: 'addLayer', layer }, { [layer.id]: data });
    }
    // Country fit takes precedence over fitToLayers (applied last so it wins)
    if (msg.country) handleSetCountry(msg.country);
    // Project camera restore (Phase 3) wins over both
    if (msg.camera) map.setCamera(msg.camera);
    map.notifyMapLoaded();
  });
}

function handleApplyAction(msg: Extract<HostMessage, { type: 'applyAction' }>): void {
  if (!map) return;
  map.applyAction(msg.action, msg.layerData);
  if (currentState) {
    currentState = reduceLocal(currentState, msg.action);
    panel?.update(currentState);
  }
}

/**
 * Tiny inline country bbox table for the webview-side fit. Mirrors a
 * subset of the core table — keeps the webview bundle free of the core
 * runtime. Unknown codes are no-ops (host should validate before sending).
 */
const COUNTRY_TABLE: Record<string, [number, number, number, number]> = {
  AR: [-73.58, -55.06, -53.64, -21.78], AT: [9.53, 46.37, 17.16, 49.02],
  AU: [112.92, -43.74, 153.64, -10.06], BE: [2.51, 49.50, 6.41, 51.51],
  BR: [-73.99, -33.75, -34.79, 5.27], CA: [-141.00, 41.68, -52.62, 83.11],
  CH: [5.95, 45.82, 10.49, 47.81], CL: [-75.64, -55.98, -66.42, -17.51],
  CN: [73.55, 18.16, 134.77, 53.56], CO: [-78.99, -4.23, -66.85, 13.39],
  CZ: [12.09, 48.55, 18.86, 51.06], DE: [5.86, 47.27, 15.04, 55.06],
  DK: [8.07, 54.55, 15.16, 57.75], EG: [24.70, 22.00, 36.87, 31.67],
  ES: [-9.30, 36.00, 4.32, 43.79], FI: [20.62, 59.81, 31.59, 70.09],
  FR: [-5.14, 41.33, 9.56, 51.09], GB: [-8.65, 49.86, 1.77, 60.86],
  GR: [19.37, 34.80, 29.65, 41.75], ID: [95.01, -11.01, 141.02, 6.08],
  IE: [-10.48, 51.39, -5.99, 55.38], IL: [34.27, 29.50, 35.90, 33.34],
  IN: [68.18, 6.75, 97.40, 35.50], IS: [-24.55, 63.30, -13.50, 66.57],
  IT: [6.63, 35.49, 18.52, 47.10], JP: [122.93, 24.04, 145.81, 45.55],
  KE: [33.91, -4.68, 41.91, 5.51], KR: [125.06, 33.19, 129.58, 38.61],
  MA: [-13.17, 27.66, -1.01, 35.93], MX: [-118.40, 14.53, -86.71, 32.72],
  MY: [99.64, 0.86, 119.27, 7.36], NG: [2.69, 4.27, 14.68, 13.89],
  NL: [3.36, 50.75, 7.23, 53.55], NO: [4.65, 57.98, 31.29, 71.18],
  NZ: [165.86, -47.29, 178.91, -34.39], PE: [-81.41, -18.35, -68.65, -0.04],
  PH: [116.93, 4.59, 126.61, 21.12], PL: [14.07, 49.00, 24.15, 54.84],
  PT: [-9.50, 36.96, -6.19, 42.15], RU: [19.66, 41.19, 180.00, 81.86],
  SA: [34.49, 16.38, 55.67, 32.16], SE: [11.10, 55.34, 24.16, 69.06],
  SG: [103.60, 1.20, 104.06, 1.48], TH: [97.34, 5.61, 105.64, 20.47],
  TR: [26.04, 35.82, 44.79, 42.14], UA: [22.13, 44.39, 40.22, 52.38],
  US: [-125.00, 24.40, -66.93, 49.38], VN: [102.14, 8.59, 109.47, 23.39],
  ZA: [16.45, -34.83, 32.89, -22.13],
};
const WORLD_BBOX: [number, number, number, number] = [-180, -85, 180, 85];

function handleSetCountry(code: string | null): void {
  if (!map) return;
  if (!code) { map.setCountry(null, WORLD_BBOX); return; }
  const bbox = COUNTRY_TABLE[code.toUpperCase()];
  if (!bbox) {
    send({ type: 'error', message: `Unknown country code: ${code}`, code: 'NO_COUNTRY_BBOX' });
    return;
  }
  map.setCountry(code, bbox);
}

type ApplyActionPayload = Extract<HostMessage, { type: 'applyAction' }>['action'];

function reduceLocal(state: LayerState, action: ApplyActionPayload): LayerState {
  switch (action.type) {
    case 'addLayer':
      if (state.layers.some((l) => l.id === action.layer.id)) return state;
      return { ...state, layers: [...state.layers, action.layer] };
    case 'removeLayer':
      return { ...state, layers: state.layers.filter((l) => l.id !== action.layerId) };
    case 'renameLayer': {
      const name = action.name.trim();
      return {
        ...state,
        layers: state.layers.map((l) =>
          l.id === action.layerId
            ? { ...l, displayName: name === '' ? l.fileName : name }
            : l,
        ),
      };
    }
    case 'setLayerColor':
      return { ...state, layers: state.layers.map((l) => l.id === action.layerId ? { ...l, color: action.color } : l) };
    case 'setLayerStrokeWidth':
      return { ...state, layers: state.layers.map((l) => l.id === action.layerId ? { ...l, strokeWidth: action.width } : l) };
    case 'setLayerVisible':
      return { ...state, layers: state.layers.map((l) => l.id === action.layerId ? { ...l, visible: action.visible } : l) };
    case 'createGroup': {
      const memberIds = new Set(action.layerIds);
      return {
        layers: state.layers.map((l) => memberIds.has(l.id) ? { ...l, groupId: action.group.id, color: action.group.color } : l),
        groups: [...state.groups, action.group],
      };
    }
    case 'renameGroup':
      return { ...state, groups: state.groups.map((g) => g.id === action.groupId ? { ...g, name: action.name.trim() || 'Untitled' } : g) };
    case 'setGroupColor':
      return {
        groups: state.groups.map((g) => g.id === action.groupId ? { ...g, color: action.color } : g),
        layers: state.layers.map((l) => l.groupId === action.groupId ? { ...l, color: action.color } : l),
      };
    case 'setGroupVisible':
      return {
        groups: state.groups.map((g) => g.id === action.groupId ? { ...g, visible: action.visible } : g),
        layers: state.layers.map((l) => l.groupId === action.groupId ? { ...l, visible: action.visible } : l),
      };
    case 'deleteGroup':
      return {
        layers: state.layers.map((l) => l.groupId === action.groupId ? { ...l, groupId: null } : l),
        groups: state.groups.filter((g) => g.id !== action.groupId),
      };
    case 'addToGroup': {
      const group = state.groups.find((g) => g.id === action.groupId);
      if (!group) return state;
      return { ...state, layers: state.layers.map((l) => l.id === action.layerId ? { ...l, groupId: group.id, color: group.color } : l) };
    }
    case 'removeFromGroup':
      return { ...state, layers: state.layers.map((l) => l.id === action.layerId ? { ...l, groupId: null } : l) };
    default:
      return state;
  }
}

send({ type: 'ready' });

export {};
