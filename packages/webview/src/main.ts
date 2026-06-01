/**
 * Webview entry point.
 *
 * Order of operations:
 *   1. Acquire the vscode webview API (single call, cached)
 *   2. Post {type:'ready'} to signal the extension host the bridge is alive
 *   3. Wait for {type:'init', ...} → bootstrap Mapbox, render initial layers
 *   4. Handle subsequent host messages (`setBasemap`, ...) by routing to map
 *
 * Mapbox GL JS itself is loaded by a separate <script> tag in the host HTML;
 * by the time this module runs, `window.mapboxgl` is already defined.
 */
import './styles.css';
import type { HostMessage, WebviewMessage } from '@maps-viewer/shared';
import { MapboxMap } from './map/mapbox-map.js';

interface VsCodeApi {
  postMessage(msg: WebviewMessage): void;
}

declare const acquireVsCodeApi: undefined | (() => VsCodeApi);

function getVsCodeApi(): VsCodeApi | null {
  try {
    return typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
  } catch {
    return null;
  }
}

const vscode = getVsCodeApi();
const send = (m: WebviewMessage): void => {
  if (vscode) vscode.postMessage(m);
};

let map: MapboxMap | null = null;
let mapReady = false;

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'init') {
    void handleInit(msg).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      send({ type: 'error', message, code: 'INIT_FAIL' });
    });
  } else if (msg.type === 'setBasemap' && map) {
    try {
      map.setBasemap(msg.basemap);
    } catch (err) {
      send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }
});

/**
 * Convert a same-origin-fetchable JS URL into a Blob URL that lives at the
 * page's own origin. Workers must be constructed from a same-origin URL;
 * `webview.asWebviewUri(...)` returns a `https://file+.vscode-resource...`
 * URL which is a *different* origin from the page's `vscode-webview://...`
 * scheme. Round-tripping through a Blob whose URL is created by *this*
 * window puts the worker source at this window's origin.
 */
async function makeSameOriginWorkerUrl(remoteUrl: string): Promise<string> {
  const response = await fetch(remoteUrl);
  if (!response.ok) {
    throw new Error(`fetch worker: ${response.status} ${response.statusText}`);
  }
  const source = await response.text();
  return URL.createObjectURL(new Blob([source], { type: 'application/javascript' }));
}

async function handleInit(msg: Extract<HostMessage, { type: 'init' }>): Promise<void> {
  const container = document.getElementById('map');
  if (!container) {
    send({ type: 'error', message: '#map container not found', code: 'NO_CONTAINER' });
    return;
  }

  if (!window.mapboxgl) {
    send({ type: 'error', message: 'mapbox-gl not loaded', code: 'NO_MAPBOX' });
    return;
  }

  window.mapboxgl.accessToken = msg.mapboxToken;
  if (window.__MAPBOX_WORKER_URL__) {
    window.mapboxgl.workerUrl = await makeSameOriginWorkerUrl(window.__MAPBOX_WORKER_URL__);
  }

  map = new MapboxMap(container, msg.basemap, send);
  map.whenReady(() => {
    if (!map) return;
    for (const layer of msg.layers) map.addLayer(layer);
    mapReady = true;
    map.notifyMapLoaded();
  });
}

// keep linter happy about unused state flag — used for debugging in devtools
void mapReady;

send({ type: 'ready' });
