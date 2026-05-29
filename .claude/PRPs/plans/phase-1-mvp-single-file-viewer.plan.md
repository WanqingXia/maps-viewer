# Plan: Phase 1 — MVP Single-File Viewer

## Summary

Wire up the **core right-click-to-map loop** end to end: user right-clicks a `.geojson` in the explorer → "View in Maps" → webview panel opens beside the editor → Mapbox GL JS renders the file with one colored layer → hover highlights features yellow with a properties popup → top-right toggle switches between Standard and Satellite basemaps. Introduces the BYO Mapbox token first-run flow stored in `SecretStorage`.

## User Story

As a **GIS engineer working in VS Code**, I want to **right-click a `.geojson` file and see it on a real map without leaving the IDE**, so that **I can sanity-check geometry and properties without context-switching to geojson.io**.

## Problem → Solution

Scaffold-only repo from Phase 0 → working single-file GeoJSON viewer that validates the core hypothesis: "this can replace my geojson.io habit for single-file checks."

## Metadata

- **Complexity**: Large
- **Source PRD**: `.claude/PRPs/prds/maps-viewer.prd.md`
- **PRD Phase**: Phase 1 — MVP Single-file viewer
- **Estimated Files**: ~25

---

## UX Design

### Before (Phase 0)
```
┌───────────────────────────────────────────────────┐
│ VS Code Explorer                                  │
│   ├─ data/                                        │
│   │   └─ regions.geojson  ← right-click? nothing  │
│   │     useful happens                            │
│   └─ src/                                         │
└───────────────────────────────────────────────────┘
```

### After
```
┌───────────────────────────────────────────────┬────────────────────────────────────┐
│ Explorer                                      │  Maps Viewer: regions.geojson      │
│   ├─ data/                                    │  ┌─────────────────────────────┐   │
│   │   └─ regions.geojson  ← right-click       │  │ [Standard ▾] [Satellite]    │   │
│   │     → "View in Maps"                      │  │                             │   │
│   └─ src/                                     │  │      (Mapbox map           )│   │
│                                               │  │      ( features colored    )│   │
│                                               │  │      ( hover → yellow      )│   │
│                                               │  │      ( popup w/ properties )│   │
│                                               │  └─────────────────────────────┘   │
└───────────────────────────────────────────────┴────────────────────────────────────┘

  First-run only:
  ┌─────────────────────────────────────────────────────┐
  │  Mapbox token required                              │
  │  Enter your Mapbox public token (pk.eyJ...).        │
  │  [ Paste token              ] [Get a free token]    │
  └─────────────────────────────────────────────────────┘
```

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| Right-click `.geojson` in Explorer | default menu | + "View in Maps" item | `explorer/context` + `editor/context` |
| First map open | n/a | Token prompt | One-time per machine |
| Hover feature on map | n/a | Highlights `#FFFF00` + properties popup | Mapbox `feature-state` |
| Top-right of map | n/a | Standard / Satellite segmented control | Custom DOM, not Mapbox NavigationControl |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `.claude/PRPs/plans/phase-0-repo-scaffold.plan.md` | "Patterns to Establish" | Naming, logging, error, build patterns to mirror |
| P0 | `.claude/PRPs/prds/maps-viewer.prd.md` | "Technical Approach" | Mapbox CSP bundle, hover via feature-state, BYO token |
| P1 | `packages/vscode/src/extension.ts` | all (~20 lines from Phase 0) | Existing activation entry to extend |
| P1 | `packages/vscode/src/util/logger.ts` | all (~20 lines) | Use this Logger, do not introduce new logging |
| P1 | `packages/shared/src/errors.ts` | all | Reuse `MapsViewerError` and `TokenMissingError` |
| P2 | `packages/webview/src/main.ts` | all (~15 lines from Phase 0) | Replace stub with real entry that mounts the map |
| P2 | `packages/vscode/package.json` | `contributes` block | Will gain `menus`, `configuration`, and a new command |

## External Documentation

| Topic | Source | Key Takeaway |
|---|---|---|
| Mapbox GL JS CSP-strict bundle | https://docs.mapbox.com/mapbox-gl-js/guides/security-and-testing/ | Load `mapbox-gl-csp.js` + set `mapboxgl.workerUrl` to same-origin worker file. ESM bundle is NOT viable in webviews. |
| VS Code Webview API | https://code.visualstudio.com/api/extension-guides/webview | `localResourceRoots`, `asWebviewUri`, `retainContextWhenHidden`, CSP nonce |
| Webview CSP | https://code.visualstudio.com/api/extension-guides/webview#content-security-policy | Required directives below |
| Mapbox feature-state hover | https://docs.mapbox.com/mapbox-gl-js/example/hover-styles/ | `generateId: true` on source + `setFeatureState` on mouseenter/mouseleave |
| `SecretStorage` | https://code.visualstudio.com/api/references/vscode-api#SecretStorage | `context.secrets.get/store/delete`; key namespace is the extension's |
| `vscode.window.showInputBox` | https://code.visualstudio.com/api/references/vscode-api#window.showInputBox | `password: true`, `validateInput`, `prompt`, `placeHolder` |

---

## Patterns to Mirror (from Phase 0)

- **NAMING**: kebab-case files, PascalCase classes, camelCase functions
- **LOGGING**: always go through `Logger.create()`. No `console.log` in extension host
- **ERROR_HANDLING**: throw `MapsViewerError` subclasses; catch at command boundary

## Patterns this phase introduces (Phase 2+ mirrors)

### WEBVIEW_MESSAGE_PROTOCOL
All extension ↔ webview communication is typed. Discriminated union in `packages/shared/src/messages.ts`. Webview never reads files directly; extension reads files and posts parsed GeoJSON.

```ts
// packages/shared/src/messages.ts
import type { FeatureCollection } from 'geojson';

export type ColorHex = `#${string}`;

export interface LayerInit {
  layerId: string;
  fileName: string;
  geojson: FeatureCollection;
  color: ColorHex;
  strokeWidth: number;        // default 3 in Phase 1
}

// extension → webview
export type HostMessage =
  | { type: 'init'; mapboxToken: string; layers: LayerInit[]; basemap: 'standard' | 'satellite' }
  | { type: 'setBasemap'; basemap: 'standard' | 'satellite' };

// webview → extension
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'error'; message: string; code?: string }
  | { type: 'mapLoaded' };

export const POST_MESSAGE_VERSION = 1;
```

### TOKEN_STORAGE
Single source of truth: `TokenManager` class wrapping `context.secrets`. Key is `MAPBOX_TOKEN_KEY = 'mapsViewer.mapboxToken'`. No direct `context.secrets` calls anywhere else.

```ts
// packages/vscode/src/token/token-manager.ts
import * as vscode from 'vscode';
import { TokenMissingError } from '@maps-viewer/shared';

const MAPBOX_TOKEN_KEY = 'mapsViewer.mapboxToken';

export class TokenManager {
  constructor(private secrets: vscode.SecretStorage) {}
  async get(): Promise<string | undefined> { return this.secrets.get(MAPBOX_TOKEN_KEY); }
  async getOrThrow(): Promise<string> {
    const t = await this.get();
    if (!t) throw new TokenMissingError();
    return t;
  }
  async set(token: string): Promise<void> { await this.secrets.store(MAPBOX_TOKEN_KEY, token); }
  async clear(): Promise<void> { await this.secrets.delete(MAPBOX_TOKEN_KEY); }
}
```

### WEBVIEW_PANEL_LIFECYCLE
One `MapPanel` class encapsulates a `vscode.WebviewPanel`. Static `MapPanel.show(...)` factory. Disposes message subscription and panel together. Reuses panel if one already exists for the same key (file path in Phase 1; project ID in Phase 3).

### CSP_NONCE
Fresh nonce per HTML render. `getNonce()` returns a 32-char alphanumeric string. CSP `script-src` uses `'nonce-${nonce}'`; each `<script>` tag carries the same nonce attribute.

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `/packages/shared/src/messages.ts` | CREATE | Discriminated unions for ext↔webview |
| `/packages/shared/src/colors.ts` | CREATE | 22-color palette constant (20 colors + white + black per PRD) |
| `/packages/shared/src/index.ts` | UPDATE | Re-export new modules |
| `/packages/vscode/src/extension.ts` | UPDATE | Register `viewInMaps` command, wire `TokenManager` |
| `/packages/vscode/src/commands/view-in-maps.ts` | CREATE | Reads file, ensures token, opens `MapPanel` |
| `/packages/vscode/src/commands/set-mapbox-token.ts` | CREATE | Command for resetting/updating token |
| `/packages/vscode/src/map-panel.ts` | CREATE | Webview panel host + message routing |
| `/packages/vscode/src/token/token-manager.ts` | CREATE | `SecretStorage` wrapper |
| `/packages/vscode/src/token/prompt-for-token.ts` | CREATE | First-run input box flow |
| `/packages/vscode/src/util/get-nonce.ts` | CREATE | CSP nonce generator |
| `/packages/vscode/src/util/get-html.ts` | CREATE | Build the webview HTML with CSP, nonce, asWebviewUri |
| `/packages/vscode/src/util/parse-geojson.ts` | CREATE | Safe file read + `JSON.parse` + validation |
| `/packages/vscode/package.json` | UPDATE | Add commands, menus, configuration, deps |
| `/packages/webview/index.html` | UPDATE | Real HTML hosting `<div id="map">` + Mapbox CSS link |
| `/packages/webview/src/main.ts` | UPDATE | Acquires vscode API, listens for `init`, creates `MapboxMap` |
| `/packages/webview/src/map/mapbox-map.ts` | CREATE | Mapbox GL JS wrapper class |
| `/packages/webview/src/map/hover.ts` | CREATE | Feature-state highlight wiring |
| `/packages/webview/src/map/render-layer.ts` | CREATE | Pure function: given a `LayerInit`, add source+layers to map |
| `/packages/webview/src/ui/basemap-toggle.ts` | CREATE | Top-right Standard/Satellite control |
| `/packages/webview/src/ui/properties-popup.ts` | CREATE | Floating panel showing hovered feature properties |
| `/packages/webview/src/styles.css` | CREATE | Minimal layout + popup styling |
| `/packages/webview/vendor/mapbox-gl-csp.js` | VENDOR | Pinned Mapbox CSP-strict bundle (copied at build) |
| `/packages/webview/vendor/mapbox-gl-csp-worker.js` | VENDOR | Pinned worker |
| `/packages/webview/vendor/mapbox-gl.css` | VENDOR | Pinned Mapbox CSS |
| `/packages/webview/scripts/copy-mapbox.mjs` | CREATE | Prebuild script copying CSP bundle from `node_modules/mapbox-gl` to `vendor/` |
| `/packages/core/src/__tests__/messages.test.ts` | CREATE | Verify message discriminated union compiles + simple round-trip |

## NOT Building

- Multi-file in one map (Phase 2 — opening a 2nd file just opens a 2nd `MapPanel`)
- Layer panel UI inside the webview (Phase 2)
- Color picker / stroke width slider (Phase 2)
- Maps Manager activity-bar / project persistence (Phase 3)
- Primary key / Locate / country scoping / dot rendering (Phase 4)
- Telemetry of any kind (Phase 5 decision)
- Marketplace icon / README polish (Phase 5)

---

## Step-by-Step Tasks

### Task 1: Vendor the Mapbox CSP-strict bundle
- **ACTION**: Add `mapbox-gl@^3.0.0` to `packages/webview` devDeps. Write `scripts/copy-mapbox.mjs` that copies `mapbox-gl-csp.js`, `mapbox-gl-csp-worker.js`, and `mapbox-gl.css` from `node_modules/mapbox-gl/dist/` to `packages/webview/vendor/`. Wire as `prebuild` script.
- **IMPLEMENT**:
  ```js
  // packages/webview/scripts/copy-mapbox.mjs
  import { cp, mkdir } from 'node:fs/promises';
  import { resolve } from 'node:path';
  const src = resolve('node_modules/mapbox-gl/dist');
  const dst = resolve('vendor');
  await mkdir(dst, { recursive: true });
  for (const f of ['mapbox-gl-csp.js', 'mapbox-gl-csp-worker.js', 'mapbox-gl.css']) {
    await cp(`${src}/${f}`, `${dst}/${f}`);
  }
  console.log('Vendored Mapbox CSP bundle');
  ```
  `package.json` add: `"prebuild": "node scripts/copy-mapbox.mjs"`
- **GOTCHA**: Do **not** import `mapbox-gl` from `src/`; the bundle is loaded as a `<script>` tag via `asWebviewUri()`. Declare a `window.mapboxgl` global type via `src/types/mapbox.d.ts`.
- **VALIDATE**: After `pnpm install && pnpm --filter @maps-viewer/webview run build`, `vendor/mapbox-gl-csp.js` exists.

### Task 2: Add `getNonce()` and webview HTML builder
- **ACTION**: Create `get-nonce.ts` + `get-html.ts`
- **IMPLEMENT**:
  ```ts
  // packages/vscode/src/util/get-nonce.ts
  export function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }
  ```
  ```ts
  // packages/vscode/src/util/get-html.ts
  import * as vscode from 'vscode';
  import { getNonce } from './get-nonce.js';

  export function getWebviewHtml(webview: vscode.Webview, extUri: vscode.Uri, title: string): string {
    const nonce = getNonce();
    const u = (p: string[]) => webview.asWebviewUri(vscode.Uri.joinPath(extUri, ...p));
    const mapboxJs = u(['..', 'webview', 'vendor', 'mapbox-gl-csp.js']);
    const mapboxWorker = u(['..', 'webview', 'vendor', 'mapbox-gl-csp-worker.js']);
    const mapboxCss = u(['..', 'webview', 'vendor', 'mapbox-gl.css']);
    const webviewJs = u(['..', 'webview', 'dist', 'webview.js']);
    const webviewCss = u(['..', 'webview', 'dist', 'style.css']);
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} https: data: blob:`,
      `script-src 'nonce-${nonce}' ${webview.cspSource}`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `worker-src ${webview.cspSource}`,
      `connect-src https://*.mapbox.com https://*.tiles.mapbox.com https://api.mapbox.com https://events.mapbox.com`,
      `font-src ${webview.cspSource}`,
    ].join('; ');
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <link rel="stylesheet" href="${mapboxCss}" />
  <link rel="stylesheet" href="${webviewCss}" />
  <title>${title}</title>
</head>
<body>
  <div id="map"></div>
  <script nonce="${nonce}" src="${mapboxJs}"></script>
  <script nonce="${nonce}">
    window.__MAPBOX_WORKER_URL__ = "${mapboxWorker}";
  </script>
  <script nonce="${nonce}" src="${webviewJs}"></script>
</body>
</html>`;
  }
  ```
- **GOTCHA**: `extUri` is the **extension's** root URI (`packages/vscode`). The `..` relative segment reaches the sibling `packages/webview`. Phase 5 may flatten this when packaging the VSIX.
- **GOTCHA**: `localResourceRoots` must include `packages/vscode`, `packages/webview/dist`, and `packages/webview/vendor` (set in `MapPanel`).
- **VALIDATE**: Manual — open webview dev tools, confirm CSP meta tag, all script `src=` resolve to `vscode-webview://…`, no CSP violations in console.

### Task 3: Build `TokenManager` + first-run prompt
- **ACTION**: Create `token-manager.ts` and `prompt-for-token.ts`
- **IMPLEMENT**:
  ```ts
  // packages/vscode/src/token/prompt-for-token.ts
  import * as vscode from 'vscode';
  import { TokenMissingError } from '@maps-viewer/shared';
  import type { TokenManager } from './token-manager.js';

  const GET_TOKEN_URL = 'https://account.mapbox.com/access-tokens/';

  export async function ensureToken(tm: TokenManager): Promise<string> {
    const existing = await tm.get();
    if (existing) return existing;
    const choice = await vscode.window.showInformationMessage(
      'Maps Viewer needs a Mapbox public token to render maps.',
      { modal: false },
      'Paste token', 'Get free token (opens browser)', 'Cancel',
    );
    if (choice === 'Get free token (opens browser)') {
      await vscode.env.openExternal(vscode.Uri.parse(GET_TOKEN_URL));
    }
    if (choice !== 'Paste token' && choice !== 'Get free token (opens browser)') {
      throw new TokenMissingError();
    }
    const input = await vscode.window.showInputBox({
      prompt: 'Paste your Mapbox public token (starts with pk.)',
      password: true,
      ignoreFocusOut: true,
      placeHolder: 'pk.eyJ1...',
      validateInput: t => (t && t.startsWith('pk.')) ? undefined : 'Token must start with "pk."',
    });
    if (!input) throw new TokenMissingError();
    await tm.set(input.trim());
    return input.trim();
  }
  ```
- **MIRROR**: `TokenManager` pattern above; error subclass from Phase 0
- **GOTCHA**: Public Mapbox tokens always start with `pk.`. Secret tokens (`sk.`) MUST be rejected — they'd be exposed in the webview.
- **VALIDATE**: F5 → run "View in Maps" with no token → prompt fires → paste valid `pk.…` token → command resumes. Re-running shows no prompt.

### Task 4: Parse-geojson utility
- **ACTION**: Safe file load + validate
- **IMPLEMENT**:
  ```ts
  // packages/vscode/src/util/parse-geojson.ts
  import * as vscode from 'vscode';
  import type { FeatureCollection } from 'geojson';
  import { MapsViewerError } from '@maps-viewer/shared';

  export class GeoJsonParseError extends MapsViewerError {
    constructor(detail: string, cause?: unknown) { super(`Invalid GeoJSON: ${detail}`, 'GEOJSON_PARSE', cause); }
  }

  const MAX_BYTES = 50 * 1024 * 1024;

  export async function readGeoJsonFile(uri: vscode.Uri): Promise<FeatureCollection> {
    const stat = await vscode.workspace.fs.stat(uri);
    if (stat.size > MAX_BYTES) {
      throw new GeoJsonParseError(`file too large (${(stat.size / 1_048_576).toFixed(1)}MB > 50MB)`);
    }
    const bytes = await vscode.workspace.fs.readFile(uri);
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder().decode(bytes)); }
    catch (e) { throw new GeoJsonParseError('not valid JSON', e); }
    if (!parsed || typeof parsed !== 'object' ||
        (parsed as any).type !== 'FeatureCollection' ||
        !Array.isArray((parsed as any).features)) {
      throw new GeoJsonParseError('top-level type must be FeatureCollection with a features array');
    }
    return parsed as FeatureCollection;
  }
  ```
- **GOTCHA**: We do NOT validate per-feature geometry — Mapbox is tolerant and we want partial results. Hard fail only on JSON parse + top-level shape.

### Task 5: `MapPanel` — webview host
- **ACTION**: Create `map-panel.ts` orchestrating webview lifecycle, message routing, layer init
- **IMPLEMENT** (skeleton):
  ```ts
  // packages/vscode/src/map-panel.ts
  import * as vscode from 'vscode';
  import type { HostMessage, WebviewMessage, LayerInit } from '@maps-viewer/shared';
  import { getWebviewHtml } from './util/get-html.js';
  import type { Logger } from './util/logger.js';

  const VIEW_TYPE = 'mapsViewer.mapPanel';

  export class MapPanel {
    private static panels = new Map<string, MapPanel>();
    private disposables: vscode.Disposable[] = [];
    private pendingLayers: LayerInit[] = [];

    private constructor(
      private readonly panel: vscode.WebviewPanel,
      private readonly logger: Logger,
      private readonly mapboxToken: string,
      private readonly key: string,
    ) {
      this.panel.webview.onDidReceiveMessage(this.onWebviewMessage, this, this.disposables);
      this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    static async show(args: {
      key: string;
      title: string;
      extUri: vscode.Uri;
      webviewDistUri: vscode.Uri;
      webviewVendorUri: vscode.Uri;
      logger: Logger;
      mapboxToken: string;
      layers: LayerInit[];
    }): Promise<MapPanel> {
      const existing = MapPanel.panels.get(args.key);
      if (existing) { existing.panel.reveal(); existing.postInit(args.layers); return existing; }
      const panel = vscode.window.createWebviewPanel(
        VIEW_TYPE, args.title, vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [args.extUri, args.webviewDistUri, args.webviewVendorUri],
        },
      );
      const mp = new MapPanel(panel, args.logger, args.mapboxToken, args.key);
      panel.webview.html = getWebviewHtml(panel.webview, args.extUri, args.title);
      MapPanel.panels.set(args.key, mp);
      mp.pendingLayers = args.layers;
      return mp;
    }

    private postInit(layers: LayerInit[]) {
      void this.panel.webview.postMessage({
        type: 'init', mapboxToken: this.mapboxToken, layers, basemap: 'standard',
      } satisfies HostMessage);
    }

    private onWebviewMessage = (msg: WebviewMessage) => {
      switch (msg.type) {
        case 'ready':
          this.logger.info('webview ready');
          this.postInit(this.pendingLayers);
          this.pendingLayers = [];
          break;
        case 'mapLoaded': this.logger.info('mapLoaded'); break;
        case 'error':
          this.logger.error(`webview error: ${msg.message}`, msg.code);
          void vscode.window.showErrorMessage(`Maps Viewer: ${msg.message}`);
          break;
      }
    };

    setBasemap(basemap: 'standard' | 'satellite') {
      void this.panel.webview.postMessage({ type: 'setBasemap', basemap } satisfies HostMessage);
    }

    private dispose() {
      MapPanel.panels.delete(this.key);
      this.disposables.forEach(d => d.dispose());
    }
  }
  ```
- **GOTCHA**: The webview posts `ready` AFTER `acquireVsCodeApi()` resolves. We must wait for `ready` before posting `init`, otherwise the message is dropped.
- **GOTCHA**: `retainContextWhenHidden: true` increases memory but eliminates "blank map after tab background" bugs.
- **VALIDATE**: Logger shows `webview ready` then `mapLoaded`. No CSP violation in dev tools.

### Task 6: `view-in-maps` command
- **ACTION**: Register the command, read the file, ensure token, open panel
- **IMPLEMENT**:
  ```ts
  // packages/vscode/src/commands/view-in-maps.ts
  import * as vscode from 'vscode';
  import { readGeoJsonFile } from '../util/parse-geojson.js';
  import { ensureToken } from '../token/prompt-for-token.js';
  import { MapPanel } from '../map-panel.js';
  import { PALETTE } from '@maps-viewer/shared';
  import type { TokenManager } from '../token/token-manager.js';
  import type { Logger } from '../util/logger.js';

  interface Ctx {
    extUri: vscode.Uri;
    webviewDistUri: vscode.Uri;
    webviewVendorUri: vscode.Uri;
    tokenManager: TokenManager;
    logger: Logger;
  }

  export async function viewInMaps(ctx: Ctx, uri?: vscode.Uri) {
    const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!targetUri) { void vscode.window.showWarningMessage('No GeoJSON file selected.'); return; }
    try {
      const token = await ensureToken(ctx.tokenManager);
      const fc = await readGeoJsonFile(targetUri);
      const fileName = targetUri.path.split('/').pop() ?? 'untitled.geojson';
      await MapPanel.show({
        key: targetUri.toString(),
        title: `Maps Viewer: ${fileName}`,
        extUri: ctx.extUri,
        webviewDistUri: ctx.webviewDistUri,
        webviewVendorUri: ctx.webviewVendorUri,
        logger: ctx.logger,
        mapboxToken: token,
        layers: [{
          layerId: `layer-${Date.now()}`,
          fileName,
          geojson: fc,
          color: PALETTE[0],
          strokeWidth: 3,
        }],
      });
    } catch (e) {
      ctx.logger.error('viewInMaps failed', e);
      void vscode.window.showErrorMessage(`Maps Viewer: ${(e as Error).message}`);
    }
  }
  ```
- **MIRROR**: Error catch at command boundary per ERROR_HANDLING pattern

### Task 7: Wire `package.json` contributions
- **ACTION**: Add commands, menu entries, configuration
- **IMPLEMENT**:
  ```jsonc
  "activationEvents": ["onLanguage:json", "onLanguage:geojson", "onCommand:mapsViewer.viewInMaps"],
  "contributes": {
    "commands": [
      { "command": "mapsViewer.about", "title": "Maps Viewer: About" },
      { "command": "mapsViewer.viewInMaps", "title": "View in Maps", "category": "Maps Viewer" },
      { "command": "mapsViewer.setMapboxToken", "title": "Set Mapbox Token…", "category": "Maps Viewer" }
    ],
    "menus": {
      "explorer/context": [
        { "command": "mapsViewer.viewInMaps", "when": "resourceExtname == .geojson", "group": "navigation@10" }
      ],
      "editor/context": [
        { "command": "mapsViewer.viewInMaps", "when": "resourceExtname == .geojson", "group": "navigation@10" }
      ]
    },
    "configuration": {
      "title": "Maps Viewer",
      "properties": {
        "mapsViewer.defaultBasemap": {
          "type": "string", "enum": ["standard","satellite"], "default": "standard",
          "description": "Basemap shown when a map first opens."
        }
      }
    }
  }
  ```
- **GOTCHA**: `resourceExtname` is the extension *including the dot*.
- **GOTCHA**: We do NOT show "View in Maps" on `.json` files in v1 (noisy). Palette is the escape hatch.

### Task 8: Webview entry + Mapbox wrapper
- **ACTION**: Replace `webview/src/main.ts` stub; create `mapbox-map.ts`, `hover.ts`, `render-layer.ts`
- **IMPLEMENT** (skeleton):
  ```ts
  // packages/webview/src/main.ts
  import type { HostMessage, WebviewMessage } from '@maps-viewer/shared';
  import { MapboxMap } from './map/mapbox-map.js';
  import './styles.css';

  declare const acquireVsCodeApi: () => { postMessage(m: WebviewMessage): void };
  declare global {
    interface Window { __MAPBOX_WORKER_URL__: string; mapboxgl: any }
  }

  const vscode = acquireVsCodeApi();
  let map: MapboxMap | null = null;
  function send(m: WebviewMessage) { vscode.postMessage(m); }

  window.addEventListener('message', (e: MessageEvent<HostMessage>) => {
    const msg = e.data;
    if (msg.type === 'init') {
      window.mapboxgl.accessToken = msg.mapboxToken;
      window.mapboxgl.workerUrl = window.__MAPBOX_WORKER_URL__;
      map = new MapboxMap(document.getElementById('map')!, msg.basemap, send);
      map.whenReady(() => {
        for (const layer of msg.layers) map!.addLayer(layer);
        send({ type: 'mapLoaded' });
      });
    } else if (msg.type === 'setBasemap' && map) {
      map.setBasemap(msg.basemap);
    }
  });

  send({ type: 'ready' });
  ```
  ```ts
  // packages/webview/src/map/mapbox-map.ts
  import type { LayerInit, WebviewMessage } from '@maps-viewer/shared';
  import { wireHover } from './hover.js';
  import { renderLayer } from './render-layer.js';
  import { mountBasemapToggle } from '../ui/basemap-toggle.js';

  const STYLES = {
    standard: 'mapbox://styles/mapbox/streets-v12',
    satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
  } as const;

  export class MapboxMap {
    private map: any;
    private layers: LayerInit[] = [];
    constructor(container: HTMLElement, basemap: 'standard'|'satellite', send: (m: WebviewMessage)=>void) {
      this.map = new window.mapboxgl.Map({
        container, style: STYLES[basemap], center: [0,0], zoom: 1, projection: 'mercator',
      });
      this.map.addControl(new window.mapboxgl.NavigationControl({ visualizePitch: false }), 'bottom-right');
      mountBasemapToggle(container, basemap, b => this.setBasemap(b));
    }
    whenReady(fn: () => void) { if (this.map.loaded()) fn(); else this.map.on('load', fn); }
    addLayer(layer: LayerInit) {
      this.layers.push(layer);
      renderLayer(this.map, layer);
      wireHover(this.map, layer.layerId);
      this.fitToLayers();
    }
    setBasemap(b: 'standard'|'satellite') {
      this.map.setStyle(STYLES[b]);
      this.map.once('style.load', () => {
        for (const l of this.layers) { renderLayer(this.map, l); wireHover(this.map, l.layerId); }
      });
    }
    private fitToLayers() { /* compute bbox over all layer features, fitBounds with padding 40 */ }
  }
  ```
  - `render-layer.ts` adds 3 layers per source (`<id>-fill`, `<id>-line`, `<id>-point`); each uses a Mapbox case expression on `feature-state.hover` for `#FFFF00`.
  - `hover.ts` exports `wireHover(map, layerId)` — `mousemove` on the three sublayers sets `featureState.hover=true` and shows popup; `mouseleave` clears.
- **GOTCHA**: `mapboxgl.accessToken` must be set BEFORE constructing the `Map`.
- **GOTCHA**: `setStyle()` drops user-added sources/layers — must re-add on `style.load`. Known quirk.
- **GOTCHA**: Sources must have `generateId: true` so feature-state hover works without per-feature `id` fields.
- **VALIDATE**: Open a sample GeoJSON → see features colored → hover → yellow + popup. Satellite toggle preserves layers.

### Task 9: Basemap toggle + properties popup UI
- **ACTION**: Plain DOM components
- **IMPLEMENT**: `basemap-toggle.ts` mounts an absolutely-positioned `<div>` top-right with two `<button>` children. `properties-popup.ts` mounts a hidden `<div>` with `show(x, y, props)` / `hide()` methods. Both kept under 50 lines each.
- **GOTCHA**: Mapbox's `NavigationControl` is moved to bottom-right to avoid overlap with the top-right toggle.

### Task 10: `set-mapbox-token` command
- **ACTION**: Allow re-setting the token from the command palette
- **IMPLEMENT**: Calls `TokenManager.clear()` then `ensureToken()`.

### Task 11: Wire `extension.ts`
- **ACTION**: Compose Logger, TokenManager, command registrations
- **IMPLEMENT**: Build `Ctx` once in `activate`; pass to each command; register `viewInMaps` and `setMapboxToken`. Subscribe disposables to `context.subscriptions`.

---

## Testing Strategy

### Unit Tests (Vitest in `core`)

| Test | Input | Expected Output | Edge Case? |
|---|---|---|---|
| `messages.test.ts: HostMessage init shape` | construct init object | TS compiles + structurally valid | no |
| `colors.test.ts: PALETTE has 22 unique entries` | `PALETTE` | length 22, all unique | yes |
| `parse-geojson.test.ts: rejects non-FC` | `{type:'Feature',...}` | throws `GeoJsonParseError` code `GEOJSON_PARSE` | yes |
| `parse-geojson.test.ts: rejects oversized` | mock stat 60MB | throws "file too large" | yes |

(Parse-geojson tests live in `core` once the pure validation is extracted; until then keep in `vscode` as a TODO.)

### Edge Cases Checklist
- [ ] User cancels token prompt → no panel opens, no crash
- [ ] User pastes a malformed token (`sk.xxx`) → validation rejects with friendly message
- [ ] Empty `FeatureCollection` → map opens, fits to world, no popup
- [ ] Mixed-geometry GeoJSON → all three layer types render
- [ ] File >50MB → blocked with error message
- [ ] Invalid JSON → blocked with parse error
- [ ] Opening the same file twice → existing panel revealed (not duplicated)
- [ ] Toggling basemap → layers re-appear
- [ ] Backgrounding VS Code window → map state preserved

---

## Validation Commands

### Static Analysis
```bash
pnpm typecheck
```
EXPECT: 0 errors

### Unit Tests
```bash
pnpm test
```
EXPECT: All passing

### Build
```bash
pnpm build
```
EXPECT: All 4 packages build; `packages/webview/vendor/mapbox-gl-csp.js` present

### Extension Host Smoke
```
1. F5
2. Open a folder containing one or more .geojson files
3. Right-click foo.geojson → "View in Maps"
4. If no token: paste token in prompt
5. Confirm map renders with colored features, hover highlights yellow, popup appears
6. Click "Satellite" → basemap swaps, layers remain
7. Close panel, repeat → no token prompt second time
```

### Manual Validation
- [ ] Context menu shows "View in Maps" only on .geojson
- [ ] First-run token prompt fires; subsequent runs do not
- [ ] Map renders in ≤3s on 5MB sample
- [ ] Hover → yellow + popup
- [ ] Satellite toggle works
- [ ] No CSP violations in webview dev tools (Help → Toggle Developer Tools while panel focused)

---

## Acceptance Criteria
- [ ] `View in Maps` command available on `.geojson` context
- [ ] BYO token flow: detect missing → prompt → store → reuse
- [ ] Mapbox CSP-strict bundle loads; map renders
- [ ] Standard + Satellite toggle works
- [ ] Hover highlight (`#FFFF00`) + properties popup
- [ ] All Phase 0 patterns honored (naming, logging, errors)
- [ ] No `console.log` in production paths

## Completion Checklist
- [ ] All files in "Files to Change" implemented
- [ ] Patterns documented match implementation
- [ ] Mapbox vendor files are git-ignored
- [ ] Token never logged
- [ ] Token never serialized into panel state
- [ ] CSP is strict — no `'unsafe-eval'`, no `'unsafe-inline'` on scripts

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Mapbox bumps major with breaking style URL changes | Low | High | Pin `mapbox-gl` to `^3.x`; smoke test on bump |
| Webview CSP violation on tile request | Medium | Medium | `connect-src` includes all `*.mapbox.com` + `*.tiles.mapbox.com` |
| Worker file blocked by CSP (wrong path) | Medium | High | Set `worker-src ${webview.cspSource}`; verify `__MAPBOX_WORKER_URL__` is a `vscode-webview://` URL |
| Token leak via dev-tools or panel state | Low | High | Never include token in `webviewPanel.state` or logs |
| `setStyle` race (layers added before style.load) | Medium | Medium | Always re-add on `style.load`; track current style version |
| Large file blocks ext host on read | Medium | Medium | Hard 50MB cap; progress notification for >5MB |

## Notes

- The 20-color palette from the PRD literally has **22 strings** (the list includes `#ffffff` and `#000000`). `PALETTE` exports all 22; Phase 2's auto-assigner cycles through positions 0–19, reserving white and black for user override.
- `Math.random()` for the nonce is acceptable — CSP enforces script integrity, the nonce only needs uniqueness per render.
- `JSON.parse` for large GeoJSON is synchronous; for now we accept that within the 50MB cap. If perf complaints land, move to `node:worker_threads`.
- "Small feature as dot" rendering is Phase 4 — Phase 1 just renders everything as fills/lines/points naturally.
