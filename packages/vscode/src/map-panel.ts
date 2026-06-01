import * as vscode from 'vscode';
import type { HostMessage, WebviewMessage, LayerInit, Basemap } from '@maps-viewer/shared';
import { getWebviewHtml } from './util/get-html.js';
import type { Logger } from './util/logger.js';

const VIEW_TYPE = 'mapsViewer.mapPanel';

export interface OpenMapPanelArgs {
  key: string;
  title: string;
  extUri: vscode.Uri;
  /** Directory containing the bundled webview app + Mapbox vendor files. */
  webviewAssetsUri: vscode.Uri;
  logger: Logger;
  mapboxToken: string;
  layers: ReadonlyArray<LayerInit>;
  basemap?: Basemap;
}

/**
 * Owns one VS Code webview panel + its message bridge.
 *
 * Panels are keyed by file URI in Phase 1 (singleton-per-file); opening the
 * same file again reveals the existing panel and re-inits its layers rather
 * than spawning a duplicate. Phase 3 will switch the key to project id.
 */
export class MapPanel {
  private static readonly panels = new Map<string, MapPanel>();
  private static lastFocused: MapPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private pendingInit: HostMessage | null = null;
  private webviewReady = false;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly logger: Logger,
    private readonly key: string,
  ) {
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg: WebviewMessage) => this.onWebviewMessage(msg),
      null,
      this.disposables,
    );
    this.panel.onDidChangeViewState((e) => {
      if (e.webviewPanel.active) MapPanel.lastFocused = this;
    }, null, this.disposables);
    MapPanel.lastFocused = this;
  }

  static activeForWindow(): MapPanel | undefined {
    return MapPanel.lastFocused;
  }

  static async show(args: OpenMapPanelArgs): Promise<MapPanel> {
    const existing = MapPanel.panels.get(args.key);
    if (existing) {
      existing.panel.title = args.title;
      existing.panel.reveal(undefined, true);
      existing.queueInit({
        type: 'init',
        mapboxToken: args.mapboxToken,
        layers: args.layers,
        basemap: args.basemap ?? 'standard',
      });
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

    const mp = new MapPanel(panel, args.logger, args.key);
    panel.webview.html = getWebviewHtml({
      webview: panel.webview,
      extUri: args.extUri,
      webviewAssetsUri: args.webviewAssetsUri,
      title: args.title,
    });
    MapPanel.panels.set(args.key, mp);
    mp.queueInit({
      type: 'init',
      mapboxToken: args.mapboxToken,
      layers: args.layers,
      basemap: args.basemap ?? 'standard',
    });
    return mp;
  }

  setBasemap(basemap: Basemap): void {
    void this.post({ type: 'setBasemap', basemap });
  }

  private queueInit(msg: Extract<HostMessage, { type: 'init' }>): void {
    if (this.webviewReady) {
      void this.post(msg);
    } else {
      this.pendingInit = msg;
    }
  }

  private post(msg: HostMessage): Thenable<boolean> {
    return this.panel.webview.postMessage(msg);
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
        break;
      case 'mapLoaded':
        this.logger.info(`map loaded (key=${this.key})`);
        break;
      case 'error':
        this.logger.error(`webview error: ${msg.message}${msg.code ? ` (${msg.code})` : ''}`);
        void vscode.window.showErrorMessage(`Maps Viewer: ${msg.message}`);
        break;
    }
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
