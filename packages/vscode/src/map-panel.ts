import * as vscode from 'vscode';
import type {
  HostMessage,
  WebviewMessage,
  Layer,
  LayerState,
  LayerDataMap,
  Basemap,
  UserAction,
  Project,
  ProjectSnapshot,
  ProjectCameraState,
  ProjectFileRef,
  CountryCode,
  PrimaryKeyMap,
  LayerFeatureMetaMap,
} from '@maps-viewer/shared';
import type { FeatureCollection, Geometry, Position } from 'geojson';
import { EMPTY_LAYER_STATE, STROKE_WIDTH_DEFAULT } from '@maps-viewer/shared';
import { reduce, assignUnusedColor, collectPkValues, extractPropertyKeys, COUNTRY_BBOXES } from '@maps-viewer/core';
import type { WorkspaceFolderInfo } from '@maps-viewer/core';
import { toProjectFileRef } from '@maps-viewer/core';
import { readGeoJsonFile } from './util/parse-geojson.js';
import { getWebviewHtml } from './util/get-html.js';
import type { Logger } from './util/logger.js';

const VIEW_TYPE = 'mapsViewer.mapPanel';
const DEFAULT_CAMERA: ProjectCameraState = { center: [0, 0], zoom: 1, bearing: 0, pitch: 0 };
const CAMERA_RPC_TIMEOUT_MS = 2_000;

export interface OpenMapPanelArgs {
  key: string;
  title: string;
  extUri: vscode.Uri;
  webviewAssetsUri: vscode.Uri;
  logger: Logger;
  mapboxToken: string;
  files: ReadonlyArray<vscode.Uri>;
  basemap?: Basemap;
}

export interface OpenFromProjectArgs {
  key: string;
  title: string;
  extUri: vscode.Uri;
  webviewAssetsUri: vscode.Uri;
  logger: Logger;
  mapboxToken: string;
  project: Project;
  layerData: Map<string, FeatureCollection>;
}

/**
 * Owns one VS Code webview panel + its message bridge + the authoritative
 * LayerState for that panel.
 *
 * Phase 3 + 4 additions:
 *   - Tracks `country`, `primaryKeyByLayer` for the active project
 *   - `getProjectSnapshot()` round-trips through the webview to capture
 *     the live camera state
 *   - `openFromProject()` restores a saved project (state + camera +
 *     country + PK map) without going through file IO for the layers
 *     (caller supplies a pre-loaded layerData Map)
 *   - `setCountry` / `setPrimaryKey` / `locateFeature` for discovery
 */
export class MapPanel {
  private static readonly panels = new Map<string, MapPanel>();
  private static lastFocused: MapPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private webviewReady = false;
  private pendingInit: HostMessage | null = null;
  private readonly pendingActions: HostMessage[] = [];
  private readonly cameraRequests = new Map<string, (camera: ProjectCameraState) => void>();
  private rpcCounter = 0;

  private layerState: LayerState = EMPTY_LAYER_STATE;
  private readonly layerData = new Map<string, FeatureCollection>();
  private readonly primaryKeyByLayer = new Map<string, string>();
  private country: CountryCode | undefined = undefined;
  private camera: ProjectCameraState = DEFAULT_CAMERA;
  private readonly basemap: Basemap;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly logger: Logger,
    private readonly key: string,
    private readonly mapboxToken: string,
    basemap: Basemap,
  ) {
    this.basemap = basemap;
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg: WebviewMessage) => this.onWebviewMessage(msg),
      null,
      this.disposables,
    );
    this.panel.onDidChangeViewState(
      (e) => { if (e.webviewPanel.active) MapPanel.lastFocused = this; },
      null,
      this.disposables,
    );
    MapPanel.lastFocused = this;
  }

  // === public surface ===

  static activeForWindow(): MapPanel | undefined {
    return MapPanel.lastFocused;
  }

  /** Locate a feature by file URI + FeatureCollection.features[index]. */
  static locateFeatureInOpenPanel(uri: vscode.Uri, featureIndex: number): boolean {
    const panels = [...MapPanel.panels.values()];
    const ordered = MapPanel.lastFocused
      ? [MapPanel.lastFocused, ...panels.filter((panel) => panel !== MapPanel.lastFocused)]
      : panels;
    for (const panel of ordered) {
      if (panel.locateFeatureBySourceUri(uri, featureIndex)) return true;
    }
    return false;
  }

  /** Get the existing panel for a given key, if open. */
  static findByKey(key: string): MapPanel | undefined {
    return MapPanel.panels.get(key);
  }

  /** Read-only access for command implementations. */
  getKey(): string { return this.key; }
  getLayerState(): LayerState { return this.layerState; }
  getLayerData(layerId: string): FeatureCollection | undefined { return this.layerData.get(layerId); }
  getPrimaryKeyFor(layerId: string): string | undefined { return this.primaryKeyByLayer.get(layerId); }
  getCountry(): CountryCode | undefined { return this.country; }

  /**
   * Open (or reveal) a panel that loads one or more fresh GeoJSON files.
   * Used by the View-in-Maps + Add-File flows.
   */
  static async show(args: OpenMapPanelArgs): Promise<MapPanel> {
    const existing = MapPanel.panels.get(args.key);
    if (existing) {
      existing.panel.title = args.title;
      existing.panel.reveal(undefined, true);
      return existing;
    }

    const panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      args.title,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [args.extUri, args.webviewAssetsUri],
      },
    );

    const mp = new MapPanel(
      panel,
      args.logger,
      args.key,
      args.mapboxToken,
      args.basemap ?? 'standard',
    );
    panel.webview.html = getWebviewHtml({
      webview: panel.webview,
      extUri: args.extUri,
      webviewAssetsUri: args.webviewAssetsUri,
      title: args.title,
    });
    MapPanel.panels.set(args.key, mp);

    for (const fileUri of args.files) {
      await mp.ingestFile(fileUri);
    }

    mp.queueInit();
    return mp;
  }

  /**
   * Open (or reveal) a panel from a saved Project + pre-loaded layer data.
   * Caller (open-project command) handles file IO + repath.
   */
  static async openFromProject(args: OpenFromProjectArgs): Promise<MapPanel> {
    const existing = MapPanel.panels.get(args.key);
    if (existing) {
      existing.panel.title = args.title;
      existing.panel.reveal(undefined, true);
      return existing;
    }

    const panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      args.title,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [args.extUri, args.webviewAssetsUri],
      },
    );

    const mp = new MapPanel(
      panel,
      args.logger,
      args.key,
      args.mapboxToken,
      args.project.basemap,
    );
    panel.webview.html = getWebviewHtml({
      webview: panel.webview,
      extUri: args.extUri,
      webviewAssetsUri: args.webviewAssetsUri,
      title: args.title,
    });
    MapPanel.panels.set(args.key, mp);

    mp.layerState = args.project.layerState;
    for (const [id, fc] of args.layerData) mp.layerData.set(id, fc);
    mp.country = args.project.country;
    mp.camera = args.project.camera;
    if (args.project.primaryKeyByLayer) {
      for (const [layerId, pk] of Object.entries(args.project.primaryKeyByLayer)) {
        mp.primaryKeyByLayer.set(layerId, pk);
      }
    }

    mp.queueInit();
    return mp;
  }

  /** Add one more GeoJSON file as a new layer. */
  async addFile(uri: vscode.Uri): Promise<void> {
    const layer = await this.ingestFile(uri);
    if (!layer) return;
    const data = this.layerData.get(layer.id);
    if (!data) return;
    this.queueOrPost({
      type: 'applyAction',
      action: { type: 'addLayer', layer },
      layerData: { [layer.id]: data },
    });
  }

  setBasemap(basemap: Basemap): void {
    this.queueOrPost({ type: 'setBasemap', basemap });
  }

  setCountry(code: CountryCode | null): void {
    this.country = code ?? undefined;
    this.queueOrPost({ type: 'setCountry', country: code });
  }

  setPrimaryKey(layerId: string, key: string | null): void {
    if (key) this.primaryKeyByLayer.set(layerId, key);
    else this.primaryKeyByLayer.delete(layerId);
    this.queueOrPost({ type: 'setPrimaryKey', layerId, key });
  }

  /**
   * Resolve a PK value → feature id + centroid, then send `locate` to the
   * webview. Returns true if the lookup found a match.
   */
  locateFeature(layerId: string, pkValue: string): boolean {
    const pk = this.primaryKeyByLayer.get(layerId);
    if (!pk) return false;
    const fc = this.layerData.get(layerId);
    if (!fc) return false;

    let featureIndex = -1;
    const target = String(pkValue);
    for (let i = 0; i < fc.features.length; i++) {
      const f = fc.features[i];
      if (!f || !f.properties) continue;
      if (String(f.properties[pk]) === target) {
        featureIndex = i;
        break;
      }
    }
    if (featureIndex < 0) return false;

    const center = featureCentroid(fc.features[featureIndex]!.geometry);
    if (!center) return false;

    this.queueOrPost({ type: 'locate', layerId, featureId: featureIndex, center });
    return true;
  }

  locateFeatureById(layerId: string, featureId: number): boolean {
    const fc = this.layerData.get(layerId);
    const feature = fc?.features[featureId];
    if (!feature) return false;
    const center = featureCentroid(feature.geometry);
    if (!center) return false;
    this.queueOrPost({ type: 'locate', layerId, featureId, center });
    return true;
  }

  private locateFeatureBySourceUri(uri: vscode.Uri, featureIndex: number): boolean {
    if (!Number.isInteger(featureIndex) || featureIndex < 0) return false;
    const layer = this.layerState.layers.find((candidate) => sameUri(candidate.sourcePath, uri));
    return layer ? this.locateFeatureById(layer.id, featureIndex) : false;
  }

  /** Build a ProjectSnapshot suitable for save-project — round-trips camera through the webview. */
  async getProjectSnapshot(workspaces: ReadonlyArray<WorkspaceFolderInfo>): Promise<ProjectSnapshot> {
    const camera = await this.requestCameraState();
    this.camera = camera;
    const files: ProjectFileRef[] = [];
    for (const layer of this.layerState.layers) {
      const absolute = vscode.Uri.parse(layer.sourcePath).fsPath;
      files.push(toProjectFileRef(layer.id, absolute, workspaces));
    }
    const snapshot: ProjectSnapshot = {
      files,
      layerState: this.layerState,
      basemap: this.basemap,
      camera,
    };
    if (this.country) (snapshot as { country?: CountryCode }).country = this.country;
    if (this.primaryKeyByLayer.size > 0) {
      const pkMap: PrimaryKeyMap = {};
      for (const [id, key] of this.primaryKeyByLayer) pkMap[id] = key;
      (snapshot as { primaryKeyByLayer?: PrimaryKeyMap }).primaryKeyByLayer = pkMap;
    }
    return snapshot;
  }

  // === private ===

  private async ingestFile(uri: vscode.Uri): Promise<Layer | null> {
    let fc: FeatureCollection;
    try {
      fc = await readGeoJsonFile(uri);
    } catch (err) {
      this.logger.error(`addFile failed for ${uri.toString()}`, err);
      const msg = err instanceof Error ? err.message : String(err);
      void vscode.window.showErrorMessage(`Maps Viewer: ${msg}`);
      return null;
    }
    const fileName = uri.path.split('/').pop() ?? 'untitled.geojson';
    const id = `layer-${Date.now()}-${this.layerState.layers.length}`;
    const layer: Layer = {
      id,
      fileName,
      displayName: fileName,
      sourcePath: uri.toString(),
      color: assignUnusedColor(
        this.layerState.layers.map((existing) => existing.color),
        this.layerState.layers.length,
      ),
      strokeWidth: STROKE_WIDTH_DEFAULT,
      visible: true,
      groupId: null,
      featureCount: fc.features.length,
    };
    this.layerState = reduce(this.layerState, { type: 'addLayer', layer });
    this.layerData.set(id, fc);
    return layer;
  }

  private queueInit(): void {
    const payload: LayerDataMap = {};
    for (const [layerId, data] of this.layerData) payload[layerId] = data;
    const pkMap: PrimaryKeyMap = {};
    for (const [id, key] of this.primaryKeyByLayer) pkMap[id] = key;

    const msg: HostMessage = {
      type: 'init',
      mapboxToken: this.mapboxToken,
      state: this.layerState,
      layerData: payload,
      basemap: this.basemap,
      countries: COUNTRY_BBOXES,
      layerFeatureMeta: this.buildLayerFeatureMeta(),
      ...(this.country ? { country: this.country } : {}),
      ...(this.primaryKeyByLayer.size > 0 ? { primaryKeyByLayer: pkMap } : {}),
      ...(this.camera !== DEFAULT_CAMERA ? { camera: this.camera } : {}),
    };
    if (this.webviewReady) void this.post(msg);
    else this.pendingInit = msg;
  }

  private queueOrPost(msg: HostMessage): void {
    if (this.webviewReady) void this.post(msg);
    else this.pendingActions.push(msg);
  }

  private post(msg: HostMessage): Thenable<boolean> {
    return this.panel.webview.postMessage(msg);
  }

  private requestCameraState(): Promise<ProjectCameraState> {
    if (!this.webviewReady) {
      return Promise.resolve(this.camera);
    }
    const requestId = `cam-${++this.rpcCounter}`;
    return new Promise<ProjectCameraState>((resolve) => {
      let resolved = false;
      this.cameraRequests.set(requestId, (camera) => {
        if (resolved) return;
        resolved = true;
        resolve(camera);
      });
      void this.post({ type: 'requestCameraState', requestId });
      setTimeout(() => {
        if (resolved) return;
        resolved = true;
        this.cameraRequests.delete(requestId);
        resolve(this.camera);
      }, CAMERA_RPC_TIMEOUT_MS);
    });
  }

  private onWebviewMessage(msg: WebviewMessage): void {
    switch (msg.type) {
      case 'ready':
        this.logger.info(`map panel ready (key=${this.key})`);
        this.webviewReady = true;
        if (this.pendingInit) {
          void this.post(this.pendingInit);
          this.pendingInit = null;
        }
        while (this.pendingActions.length > 0) {
          const next = this.pendingActions.shift();
          if (next) void this.post(next);
        }
        break;
      case 'mapLoaded':
        this.logger.info(`map loaded (key=${this.key})`);
        break;
      case 'requestAction':
        this.handleUserAction(msg.action);
        break;
      case 'setCountry':
        this.setCountry(msg.country);
        break;
      case 'setPrimaryKey':
        this.setPrimaryKey(msg.layerId, msg.key);
        break;
      case 'locateFeature':
        if (!this.locateFeatureById(msg.layerId, msg.featureId)) {
          void vscode.window.showWarningMessage('Maps Viewer: feature not found.');
        }
        break;
      case 'addLayerRequest':
        void vscode.commands.executeCommand('mapsViewer.addFileToMap');
        break;
      case 'saveProjectRequest':
        void vscode.commands.executeCommand('mapsViewer.saveProject');
        break;
      case 'openExternal':
        void this.openExternal(msg.url);
        break;
      case 'cameraState': {
        const handler = this.cameraRequests.get(msg.requestId);
        if (handler) {
          this.cameraRequests.delete(msg.requestId);
          handler(msg.camera);
        }
        break;
      }
      case 'error':
        this.logger.error(`webview error: ${msg.message}${msg.code ? ` (${msg.code})` : ''}`);
        void vscode.window.showErrorMessage(`Maps Viewer: ${msg.message}`);
        break;
    }
  }

  private async openExternal(rawUrl: string): Promise<void> {
    let uri: vscode.Uri;
    try {
      uri = vscode.Uri.parse(rawUrl, true);
    } catch {
      void vscode.window.showWarningMessage('Maps Viewer: invalid external link.');
      return;
    }
    if (uri.scheme !== 'https') {
      void vscode.window.showWarningMessage('Maps Viewer: only HTTPS links can be opened.');
      return;
    }
    await vscode.env.openExternal(uri);
  }

  private handleUserAction(action: UserAction): void {
    this.layerState = reduce(this.layerState, action);
    if (action.type === 'removeLayer') {
      this.layerData.delete(action.layerId);
      this.primaryKeyByLayer.delete(action.layerId);
    }
    void this.post({ type: 'applyAction', action });
  }

  private buildLayerFeatureMeta(): LayerFeatureMetaMap {
    const out: LayerFeatureMetaMap = {};
    for (const [layerId, fc] of this.layerData) {
      const propertyKeys = extractPropertyKeys(fc.features);
      const featuresByKey: Record<string, Array<{ featureId: number; label: string }>> = {};
      for (const key of propertyKeys) {
        const values: Array<{ featureId: number; label: string }> = [];
        for (let i = 0; i < fc.features.length; i++) {
          const props = fc.features[i]?.properties;
          if (!props || props[key] === undefined || props[key] === null) continue;
          values.push({ featureId: i, label: String(props[key]) });
        }
        featuresByKey[key] = values;
      }
      out[layerId] = { featureCount: fc.features.length, propertyKeys, featuresByKey };
    }
    return out;
  }

  private dispose(): void {
    if (MapPanel.lastFocused === this) MapPanel.lastFocused = undefined;
    MapPanel.panels.delete(this.key);
    while (this.disposables.length) {
      const d = this.disposables.pop();
      try { d?.dispose(); } catch { /* noop */ }
    }
  }
}

// === Helpers ===

function featureCentroid(g: Geometry | null): [number, number] | null {
  if (!g) return null;
  switch (g.type) {
    case 'Point':
      return g.coordinates as [number, number];
    case 'MultiPoint':
    case 'LineString':
      return midOfLine(g.coordinates as ReadonlyArray<Position>);
    case 'MultiLineString':
      return midOfLine(((g.coordinates as ReadonlyArray<ReadonlyArray<Position>>)[0]) ?? []);
    case 'Polygon':
      return bboxCenter((g.coordinates as ReadonlyArray<ReadonlyArray<Position>>)[0] ?? []);
    case 'MultiPolygon': {
      const first = g.coordinates as ReadonlyArray<ReadonlyArray<ReadonlyArray<Position>>>;
      if (first.length === 0 || first[0]!.length === 0) return null;
      return bboxCenter(first[0]![0]!);
    }
    case 'GeometryCollection':
      for (const inner of g.geometries) {
        const c = featureCentroid(inner);
        if (c) return c;
      }
      return null;
    default:
      return null;
  }
}

function sameUri(sourcePath: string, uri: vscode.Uri): boolean {
  if (sourcePath === uri.toString()) return true;
  try {
    const source = vscode.Uri.parse(sourcePath);
    if (source.toString() === uri.toString()) return true;
    if (source.scheme === 'file' && uri.scheme === 'file') {
      return source.fsPath === uri.fsPath;
    }
  } catch {
    // sourcePath is extension-owned persisted data; malformed values simply do not match.
  }
  return false;
}

function midOfLine(coords: ReadonlyArray<Position>): [number, number] | null {
  if (coords.length === 0) return null;
  if (coords.length === 1) return [coords[0]![0]!, coords[0]![1]!];
  const mid = coords[Math.floor(coords.length / 2)]!;
  return [mid[0]!, mid[1]!];
}

function bboxCenter(coords: ReadonlyArray<Position>): [number, number] | null {
  if (coords.length === 0) return null;
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const p of coords) {
    const lng = p[0]!, lat = p[1]!;
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  if (!isFinite(minLng)) return null;
  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
}
