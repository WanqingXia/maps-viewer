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
import type { FeatureCollection } from 'geojson';
import type {
  FeatureOption,
  HostMessage,
  WebviewMessage,
  UserAction,
  LayerState,
  PrimaryKeyMap,
  LayerFeatureMetaMap,
  CountryBbox,
  CountryCode,
} from '@maps-viewer/shared';
import { MapboxMap } from './map/mapbox-map.js';
import { mountLayersPanel, type LayersPanel, type LayersPanelUpdate } from './ui/layers-panel.js';

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
let primaryKeyByLayer: PrimaryKeyMap = {};
let layerFeatureMeta: LayerFeatureMetaMap = {};
let countries: ReadonlyArray<CountryBbox> = [];
let currentCountry: CountryCode | null = null;
let pointRenderEnabled = false;
const hiddenFeatureIds = new Map<string, Set<number | string>>();

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
    const resizer = document.createElement('div');
    resizer.id = 'panel-resizer';
    resizer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(resizer);
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
        currentCountry = msg.country;
        updatePanel();
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
        if (msg.key) primaryKeyByLayer = { ...primaryKeyByLayer, [msg.layerId]: msg.key };
        else {
          const { [msg.layerId]: _removed, ...rest } = primaryKeyByLayer;
          primaryKeyByLayer = rest;
        }
        updatePanel();
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
  wirePanelResize(panelContainer);

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
  primaryKeyByLayer = msg.primaryKeyByLayer ?? {};
  layerFeatureMeta = msg.layerFeatureMeta ?? {};
  countries = msg.countries ?? [];
  currentCountry = msg.country ?? null;

  panel = mountLayersPanel(
    panelContainer,
    panelUpdate(),
    (action: UserAction) => {
      send({ type: 'requestAction', action });
    },
    (country) => {
      currentCountry = country;
      send({ type: 'setCountry', country });
      handleSetCountry(country);
      updatePanel();
    },
    (enabled) => {
      pointRenderEnabled = enabled;
      map?.setPointRender(enabled);
      updatePanel();
    },
    (layerId, key) => {
      if (key) primaryKeyByLayer = { ...primaryKeyByLayer, [layerId]: key };
      else {
        const { [layerId]: _removed, ...rest } = primaryKeyByLayer;
        primaryKeyByLayer = rest;
      }
      send({ type: 'setPrimaryKey', layerId, key });
      updatePanel();
    },
    (layerId, featureId) => {
      send({ type: 'locateFeature', layerId, featureId });
    },
    (layerId, featureId, visible) => {
      const hidden = hiddenFeatureIds.get(layerId) ?? new Set<number | string>();
      if (visible) hidden.delete(featureId);
      else hidden.add(featureId);
      if (hidden.size === 0) hiddenFeatureIds.delete(layerId);
      else hiddenFeatureIds.set(layerId, hidden);
      map?.setFeatureVisible(layerId, featureId, visible);
      updatePanel();
    },
    (layerId, featureIds, visible) => {
      const hidden = hiddenFeatureIds.get(layerId) ?? new Set<number | string>();
      for (const featureId of featureIds) {
        if (visible) hidden.delete(featureId);
        else hidden.add(featureId);
        map?.setFeatureVisible(layerId, featureId, visible);
      }
      if (hidden.size === 0) hiddenFeatureIds.delete(layerId);
      else hiddenFeatureIds.set(layerId, hidden);
      updatePanel();
    },
    () => send({ type: 'addLayerRequest' }),
    () => send({ type: 'saveProjectRequest' }),
  );

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

function wirePanelResize(panelContainer: HTMLElement): void {
  const resizer = document.getElementById('panel-resizer');
  let dragging = false;
  const update = (): void => {
    document.documentElement.style.setProperty('--mv-panel-width', `${panelContainer.getBoundingClientRect().width}px`);
  };
  update();
  resizer?.addEventListener('pointerdown', (event) => {
    dragging = true;
    resizer.setPointerCapture(event.pointerId);
    document.body.dataset.resizingPanel = 'true';
    event.preventDefault();
  });
  resizer?.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const nextWidth = Math.max(320, Math.min(520, event.clientX));
    document.documentElement.style.setProperty('--mv-panel-width', `${nextWidth}px`);
    event.preventDefault();
  });
  resizer?.addEventListener('pointerup', (event) => {
    if (!dragging) return;
    dragging = false;
    document.body.dataset.resizingPanel = 'false';
    resizer.releasePointerCapture(event.pointerId);
    event.preventDefault();
  });
  resizer?.addEventListener('pointercancel', () => {
    dragging = false;
    document.body.dataset.resizingPanel = 'false';
  });
}

function handleApplyAction(msg: Extract<HostMessage, { type: 'applyAction' }>): void {
  if (!map) return;
  map.applyAction(msg.action, msg.layerData);
  const addedLayerData = msg.action.type === 'addLayer' ? msg.layerData?.[msg.action.layer.id] : undefined;
  if (msg.action.type === 'addLayer' && addedLayerData) {
    layerFeatureMeta = {
      ...layerFeatureMeta,
      [msg.action.layer.id]: buildLayerMeta(addedLayerData),
    };
  }
  if (currentState) {
    currentState = reduceLocal(currentState, msg.action);
    updatePanel();
  }
}

function buildLayerMeta(fc: FeatureCollection): LayerFeatureMetaMap[string] {
  const keys = new Set<string>();
  for (const feature of fc.features) {
    const props = feature.properties;
    if (!props) continue;
    for (const key of Object.keys(props)) keys.add(key);
  }
  const propertyKeys = [...keys].sort((a, b) => a.localeCompare(b));
  const featuresByKey: Record<string, FeatureOption[]> = {};
  for (const key of propertyKeys) {
    const values: FeatureOption[] = [];
    for (let i = 0; i < fc.features.length; i++) {
      const value = fc.features[i]?.properties?.[key];
      if (value === undefined || value === null) continue;
      values.push({ featureId: i, label: String(value) });
    }
    featuresByKey[key] = values;
  }
  return { featureCount: fc.features.length, propertyKeys, featuresByKey };
}

const WORLD_BBOX: [number, number, number, number] = [-180, -85, 180, 85];

function handleSetCountry(code: string | null): void {
  if (!map) return;
  if (!code) { map.setCountry(null, WORLD_BBOX); return; }
  const match = countries.find((item) => item.code === code.toUpperCase());
  if (!match) {
    send({ type: 'error', message: `Unknown country code: ${code}`, code: 'NO_COUNTRY_BBOX' });
    return;
  }
  map.setCountry(code, match.bbox);
}

function panelUpdate(): LayersPanelUpdate {
  return {
    state: currentState ?? { layers: [], groups: [] },
    primaryKeyByLayer,
    layerFeatureMeta,
    hiddenFeatureIds,
    countries,
    country: currentCountry,
    pointRenderEnabled,
  };
}

function updatePanel(): void {
  panel?.update(panelUpdate());
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
        layers: state.layers.map((l) => l.groupId === action.groupId ? { ...l, groupId: null, color: action.restoredColors?.[l.id] ?? l.color } : l),
        groups: state.groups.filter((g) => g.id !== action.groupId),
      };
    case 'addToGroup': {
      const group = state.groups.find((g) => g.id === action.groupId);
      if (!group) return state;
      return { ...state, layers: state.layers.map((l) => l.id === action.layerId ? { ...l, groupId: group.id, color: group.color } : l) };
    }
    case 'removeFromGroup':
      return { ...state, layers: state.layers.map((l) => l.id === action.layerId ? { ...l, groupId: null, color: action.color ?? l.color } : l) };
    case 'moveLayer': {
      const currentIndex = state.layers.findIndex((l) => l.id === action.layerId);
      if (currentIndex < 0) return state;
      const targetGroup = action.targetGroupId ? state.groups.find((g) => g.id === action.targetGroupId) : undefined;
      if (action.targetGroupId && !targetGroup) return state;
      const remaining = state.layers.filter((l) => l.id !== action.layerId);
      const moved = {
        ...state.layers[currentIndex]!,
        groupId: action.targetGroupId,
        color: targetGroup?.color ?? action.color ?? state.layers[currentIndex]!.color,
      };
      const targetIndex = Math.max(0, Math.min(action.targetIndex, remaining.length));
      return {
        ...state,
        layers: [...remaining.slice(0, targetIndex), moved, ...remaining.slice(targetIndex)],
      };
    }
    default:
      return state;
  }
}

send({ type: 'ready' });

export {};
