# Maps Viewer — VS Code GeoJSON Visualizer

## Problem Statement

GIS engineers working with multiple GeoJSON files in VS Code have no in-IDE way to **visually compare them side by side**. They context-switch to web tools (geojson.io), heavyweight desktop apps (QGIS), or basic single-file VS Code extensions — none of which let them load several files, group them by color, save the configuration, and re-open it later. The 200K-install incumbent (Geo Data Viewer) has been unmaintained since January 2023, and no current extension addresses the multi-file comparison workflow.

## Evidence

- **Market scan**: of six VS Code GeoJSON viewers reviewed, only one (Geometry Viewer, ~3K installs) claims multi-dataset support — and it lacks grouping, persistence, hover popups, stroke control, and zoom-to-feature.
- **Incumbent abandoned**: Geo Data Viewer (RandomFractalsInc, 223K installs) last shipped Jan 2023, depends on Kepler.gl v2.5.5, and relies on a single hardcoded Mapbox token (`src/config.ts:5`) — fragile and frozen.
- **First-hand pain**: user (a GIS engineer) currently lacks a workflow for "open these N files together, color-code them, save as a project, reopen tomorrow."
- **OSMF tile policy** explicitly prohibits heavy/bulk use of `tile.openstreetmap.org` — this means a popular dev tool **cannot** hit OSM directly. Mapbox's `streets-v12` uses OSM under the hood, so satisfying the "OSM roads/buildings" requirement is achieved by using Mapbox styles.

## Proposed Solution

A VS Code extension that lets a developer **right-click any `.geojson` in the explorer → "View in Maps"** and immediately see it on a Mapbox GL JS map embedded in a VS Code webview, with a sidebar **"Maps Manager"** activity-bar view (modeled on the 7.27M-install Project Manager extension) for saving multi-file configurations as named projects. Layers from one or more files are organized into groups with a fixed 20-color palette, adjustable stroke width (0–50), per-layer view/hide/rename/delete, hover-to-highlight with property popup, locate-by-primary-key, and country bounding-box scoping. Standard and Satellite basemaps toggle in the top-right. Mapbox token is BYO (set once in settings via a guided first-run flow, stored in VS Code `SecretStorage`), so we never share a token or eat overage charges.

Chosen over the alternatives because:
- **Vs. extending Geo Data Viewer**: it's abandoned, locked to Kepler.gl v2.5.5, and has no path to add grouping/persistence cleanly.
- **Vs. MapLibre + Protomaps zero-config path**: Mapbox is the user's stated engine of choice, and BYO-token avoids the long-term risk of a shared key.
- **Vs. building cross-IDE (Zed) from day one**: Zed's extension API is WASM/LSP-focused and lacks a webview surface comparable to VS Code; targeting both now would force the lowest common denominator. Architecture keeps the map UI as a self-contained webview bundle so Zed can be a thin adapter later.

## Key Hypothesis

We believe **a multi-file, project-based GeoJSON viewer with Mapbox + grouping/coloring/persistence** will **replace the geojson.io / QGIS context-switch** for **GIS engineers comparing multiple files**.
We'll know we're right when **the maintainer (and their team) stop opening geojson.io and reach for "View in Maps" instead — measured as ≥5 days/week of daily-use behavior over a 4-week period after MVP ship**.

## What We're NOT Building

- **GeoJSON editing / drawing / property editing** — read-only viewer. geojson.io already does this well.
- **Other file formats (Shapefile, KML, GPX, TopoJSON)** — GeoJSON-only for v1. Adding formats multiplies parsing/edge-case work.
- **Export to PNG / PDF / Shapefile** — viewing only.
- **3D buildings, terrain, extrusion** — 2D map only. Out of MVP scope; can revisit if requested.
- **Live data / streaming GeoJSON / HTTP polling** — file-based only.
- **Cloud sync of Maps Manager projects** — local storage only. Users can opt into sync by pointing `mapsLocation` at iCloud/Dropbox.
- **Zed support in v1** — VS Code first. Shared core keeps Zed adapter feasible later.

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Daily-use replacement (primary) | ≥5 days/week over 4 weeks post-MVP | Self-reported / behavioral observation by maintainer |
| Time-to-visualize | ≤3 seconds from right-click to rendered map (cold) | Manual stopwatch on 5MB sample file |
| Project re-open success | 100% — saved project opens with identical layer state | Manual test: save project, restart VS Code, reopen |
| Multi-file load capability | ≥10 files / ≥10K features without UI freeze | Manual smoke test |
| Marketplace installs (secondary) | 500 installs in 90 days post-publish | VS Code Marketplace stats |

## Open Questions

- [ ] **Tippecanoe / vector tile pipeline**: do we need it for v1, or is GL JS's built-in supercluster sufficient for the file sizes users actually have? (Assume sufficient until proven otherwise.)
- [ ] **Country bounding-box list source**: hardcode top 50 countries, ship a curated JSON, or pull from a library like `world-atlas`? Decide in Phase 4.
- [ ] **Project portability**: should saved projects use absolute paths, workspace-relative paths, or both with a fallback? Affects sharing projects across machines.
- [ ] **Primary-key UX**: command-palette pick-by-PK input, or sidebar feature list rendered from PK values? Decide in Phase 4.
- [ ] **Mapbox token validation**: validate token format on entry, or wait for first map-load failure? UX trade-off.
- [ ] **GeoJSONL / NDJSON support**: out of scope for v1 unless a user asks. Decide post-MVP.
- [ ] **Telemetry**: do we ship opt-in usage telemetry to measure the daily-use hypothesis? Decide before publish.

---

## Users & Context

**Primary User**
- **Who**: GIS / geospatial engineers working in VS Code who produce or consume GeoJSON daily (logistics, mapping, urban planning, environmental data, etc.). Comfortable with the terminal, npm, and configuring extensions.
- **Current behavior**: Edits / generates GeoJSON in VS Code → switches to geojson.io or QGIS → drags file in → manually adjusts colors → eyeballs the result → closes the tool → loses the configuration → repeats next session.
- **Trigger**: "I just exported these N GeoJSON files and need to sanity-check that they line up / overlap correctly."
- **Success state**: Files open in VS Code with shared color coding from the last session, hover reveals properties, locate jumps to a record by ID. No external tool needed.

**Job to Be Done**
When **I've produced or received multiple GeoJSON files and need to visually sanity-check them together**, I want to **see them on a single map with consistent color coding and saved settings**, so I can **catch errors and confirm correctness without leaving my IDE**.

**Non-Users**
- **End-users of mapping products** (consumers who view finished maps): they want polished apps, not a dev tool.
- **Cartographers needing publication-quality output**: QGIS / ArcGIS Pro remain the right tool for that — we don't compete on styling depth.
- **Non-developers** without VS Code installed.
- **Power GIS analysts running spatial joins / projections / format conversions**: this is a viewer, not an analysis tool.

---

## Solution Detail

### Core Capabilities (MoSCoW)

| Priority | Capability | Rationale |
|----------|------------|-----------|
| Must | Right-click `.geojson` → "View in Maps" command | The core entry point; if this isn't seamless the whole hypothesis fails. |
| Must | Mapbox GL JS embedded in VS Code webview (CSP-strict UMD bundle) | Required to render the map at all. |
| Must | Standard + Satellite basemap toggle (top-right) | Direct user request; trivial with Mapbox styles. |
| Must | Hover-to-highlight (yellow `#FFFF00`) + properties popup | Direct request; primary inspection workflow. |
| Must | Multi-file load + per-file/group layer with shared color from 20-color palette | Solves the stated pain (multi-file comparison) — the differentiating capability. |
| Must | Per-layer view/hide, rename, delete | Direct request; minimum layer management. |
| Must | Adjustable stroke width 0–50 (default 3) | Direct request; per-layer slider. |
| Must | Maps Manager sidebar (activity-bar icon + tree view) | Persistent projects = the second differentiator. |
| Must | Save / open named "project" (file paths + layer settings) | Persistence is the moat vs. existing extensions. |
| Must | BYO Mapbox token + first-run guided setup (SecretStorage) | Avoids shared-token risk; one-time friction. |
| Should | Color picker + stroke-width slider in layer dropdown | Direct request; nice but layer defaults are usable without it. |
| Should | "Locate" feature — zoom-center on a feature by primary key | Direct request; depends on PK selection landing first. |
| Should | Primary-key selection per file/group | Direct request; enables Locate. |
| Should | Country bounding-box scoping (default world; select e.g. NZ) | Performance win for large files; per-project setting. |
| Could | Small-feature-as-dot rendering (<100m length at <1cm:500m zoom → visible dot) | Direct request; ensures small features stay discoverable. |
| Could | Drag-drop to reorder layers in Maps Manager | UX polish; not blocking. |
| Could | Project favorites / tags in Maps Manager | UX polish; mirrors Project Manager extension. |
| Won't (v1) | GeoJSON editing / drawing | Out of scope — geojson.io territory. |
| Won't (v1) | Other formats (Shapefile, KML, GPX, TopoJSON) | Scope discipline; revisit post-MVP. |
| Won't (v1) | Export to image / PDF / Shapefile | Out of scope. |
| Won't (v1) | 3D buildings / terrain / live data / cloud sync | Out of scope. |
| Won't (v1) | Zed extension | VS Code first; shared core keeps Zed feasible later. |

### MVP Scope

**Minimum to validate the hypothesis**:
1. Right-click a `.geojson` in VS Code explorer → "View in Maps" command opens a webview panel.
2. Webview shows the file rendered via Mapbox GL JS with the **default 20-color palette assigned to the layer**.
3. Standard/Satellite toggle works.
4. Hover any feature → it highlights yellow + properties popup appears.
5. BYO Mapbox token first-run prompt completes the setup in <60 seconds.

This is **Phase 1 only** and is enough to test "does this replace my geojson.io habit for single-file checks?" Once that hypothesis holds, Phase 2+ extend it to the multi-file comparison case that's the real differentiator.

### User Flow

**Critical path (Phase 1 MVP):**
```
1. User installs extension from marketplace.
2. User opens a folder containing .geojson files in VS Code.
3. User right-clicks foo.geojson → "View in Maps".
4. First time only: prompt "Enter Mapbox token" with [Get free token (60s)] button → user pastes token → stored in SecretStorage.
5. Webview panel opens beside editor, map renders foo.geojson with hover popups, satellite toggle visible top-right.
```

**Differentiator path (Phase 2+):**
```
1. User opens Maps Manager activity-bar icon.
2. User clicks "+ New Map Project" → names it, adds multiple .geojson files via picker.
3. Each file gets a distinct color from the 20-palette.
4. User toggles layers on/off, adjusts stroke width per layer, sets primary key for one group.
5. User clicks "Save". Closes VS Code.
6. Days later: opens Maps Manager → clicks saved project → identical view restored.
```

---

## Technical Approach

**Feasibility**: HIGH — every component has a documented working pattern; main risk is integration polish, not unknown unknowns.

**Architecture Notes**

```
maps-viewer/  (pnpm workspace root)
├── packages/
│   ├── shared/          # TS types: Layer, Group, Project, GeoJSONFeatureMeta, etc.
│   ├── core/            # Engine-agnostic logic: color assignment, project schema, PK indexing,
│   │                    #   country bbox table, feature-size-to-dot rules. Zero VS Code deps.
│   ├── webview/         # The map UI: HTML/CSS/TS bundle, Mapbox GL JS, hover/popup, basemap toggle,
│   │                    #   postMessage protocol. Built with Vite to a static asset bundle.
│   └── vscode/          # The VS Code extension: commands, TreeDataProvider for Maps Manager,
│                        #   webview panel host, SecretStorage for token, global-storage maps.json.
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```

**Why this layout:**
- `core` has zero VS Code deps → unit-testable, and reusable when Zed adapter lands later.
- `webview` is engine code with no VS Code API → could be opened in a browser tab for debugging.
- `vscode` is the thin adapter: commands, tree view, file IO, storage.
- `shared` keeps DTOs in sync between extension host and webview (passed over `postMessage`).

**Key technical decisions:**
- **Mapbox GL JS CSP-strict UMD bundle** (`mapbox-gl-csp.js` + `mapbox-gl-csp-worker.js`), both bundled locally and served via `webview.asWebviewUri()`. ESM bundle is **not** an option in VS Code webviews (uses blob workers, breaks CSP).
- **Token storage**: `SecretStorage` API. First-run flow uses `vscode.window.showInputBox` with a "Get a free token" button linking to mapbox.com/account/access-tokens.
- **Basemaps**: `mapbox://styles/mapbox/streets-v12` (OSM-derived) and `mapbox://styles/mapbox/satellite-streets-v12`. Toggle via `map.setStyle()` with layer-state reapply.
- **Hover highlight**: Mapbox **feature-state** (`generateId: true` on the source, `setFeatureState` on mouseenter/mouseleave) with a paint property using `['case', ['boolean', ['feature-state', 'hover'], false], '#FFFF00', <layerColor>]`. Avoids re-rendering layers.
- **Performance**: GeoJSON sources with `cluster: false` (we want features, not clusters) but `maxzoom` tuned. For >10K features, consider tippecanoe-baked vector tiles in Phase 4 if measured perf justifies it.
- **Small-feature-as-dot**: pre-compute feature length / bbox area in `core`, classify, render `type: 'circle'` layer with `['case', ['<', ['get', 'computed_length'], 100], <visible>, <hidden>]` at low zoom.
- **Maps Manager storage**: `maps.json` in extension `globalStorageUri`, schema versioned (`{ "version": 1, "projects": [...] }`), with `mapsViewer.mapsLocation` setting to point elsewhere for sync.
- **Webview ↔ extension messaging**: typed wrapper around `postMessage` with message-type discrimination. Webview never accesses file system; extension reads files and sends parsed GeoJSON over the wire (subject to size — large files >50MB may need streaming).
- **Tree view**: `TreeDataProvider` + `view/title` for "+ New", `view/item/context` `group: inline` for view/hide/rename/delete icons, `contextValue` to gate per-item actions, optional `TreeDragAndDropController` for reorder in a later phase.

**Technical Risks**

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Mapbox token expires / user revokes mid-session | Medium | Catch tile-load errors, prompt to re-enter token; never silently fail. |
| Large GeoJSON (>50MB) freezes extension host on read | Medium | Read in worker / chunked; show progress; warn on files >20MB. |
| User edits files outside VS Code → saved project paths go stale | Medium | On project open, validate paths exist; show "missing" badge + repath UI. |
| 20 colors aren't enough for very large groups | Low | Document explicitly; offer cycle-back with stroke pattern variation in a future phase. |
| Mapbox style URL changes / Mapbox SDK behavior shifts | Low | Pin Mapbox GL JS version; integration smoke test in CI on each upgrade. |
| Webview state lost when VS Code tab is backgrounded | Medium | Use `retainContextWhenHidden: true` for the webview (memory cost is acceptable for a viewer panel). |
| TypeScript monorepo + webview bundling + VS Code extension build is fiddly | Medium | Use Vite for webview, tsc/esbuild for extension, document the build flow in README from day one. |

---

## Implementation Phases

<!--
  STATUS: pending | in-progress | complete
  PARALLEL: phases that can run concurrently (e.g., "with 3" or "-")
  DEPENDS: phases that must complete first (e.g., "1, 2" or "-")
  PRP: link to generated plan file once created
-->

| # | Phase | Description | Status | Parallel | Depends | PRP Plan |
|---|-------|-------------|--------|----------|---------|----------|
| 0 | Repo scaffold | pnpm workspaces, TS config, package boundaries, build pipeline, VS Code extension shell | complete | - | - | [completed/phase-0-repo-scaffold.plan.md](../plans/completed/phase-0-repo-scaffold.plan.md) |
| 1 | MVP — Single-file viewer | Right-click command + webview + Mapbox + basemap toggle + hover popup + BYO token | complete | - | 0 | [completed/phase-1-mvp-single-file-viewer.plan.md](../plans/completed/phase-1-mvp-single-file-viewer.plan.md) · [report](../reports/phase-1-mvp-single-file-viewer-report.md) |
| 2 | Multi-file layers + styling | Multiple files in one map, 20-color palette, view/hide/rename/delete, stroke width, color picker | complete | - | 1 | [completed/phase-2-multi-file-layers-styling.plan.md](../plans/completed/phase-2-multi-file-layers-styling.plan.md) · [report](../reports/phase-2-multi-file-layers-styling-report.md) |
| 3 | Maps Manager + persistence | Activity-bar tree view, save/open named projects, layer state restored | complete | with 4 | 2 | [completed/phase-3-maps-manager-persistence.plan.md](../plans/completed/phase-3-maps-manager-persistence.plan.md) · [report](../reports/phase-3-and-4-report.md) |
| 4 | Discovery features | Primary key, Locate, country bbox, small-feature-as-dot | complete | with 3 | 2 | [completed/phase-4-discovery-features.plan.md](../plans/completed/phase-4-discovery-features.plan.md) · [report](../reports/phase-3-and-4-report.md) |
| 5 | Polish + publish | Icon, README, marketplace assets, telemetry decision, perf sweep, publish | complete | - | 3, 4 | [completed/phase-5-polish-publish.plan.md](../plans/completed/phase-5-polish-publish.plan.md) · [report](../reports/phase-5-polish-publish-report.md) |

### Phase Details

**Phase 0: Repo scaffold**
- **Goal**: Working pnpm monorepo where the VS Code extension launches in the Extension Host with an empty webview.
- **Scope**: `pnpm-workspace.yaml`, four packages (shared/core/webview/vscode), `tsconfig.base.json`, Vite for webview, esbuild or tsc for extension, `.vscode/launch.json` for F5 debug, basic `package.json` contributes block (no commands yet, just the activation skeleton).
- **Success signal**: F5 launches Extension Host; running an "About Maps Viewer" hello-world command prints to the output channel.

**Phase 1: MVP — Single-file viewer**
- **Goal**: Validate the core right-click-to-map loop end-to-end.
- **Scope**:
  - Register `mapsViewer.viewInMaps` command bound to `editor/context` + `explorer/context` menus, filtered to `.geojson` (and `.json` files containing GeoJSON).
  - Webview panel opens beside editor (`vscode.ViewColumn.Beside`).
  - Mapbox GL JS loaded with CSP-strict bundle and worker URL set.
  - BYO token first-run flow: detect missing token → input box with help link → store in `SecretStorage`.
  - Render the file as one layer with a default color from the palette.
  - Top-right basemap toggle (Standard / Satellite) via floating UI element.
  - Hover-to-highlight (`#FFFF00`) + properties popup (small floating panel showing all `properties` of hovered feature).
- **Success signal**: From a clean install, right-clicking a sample GeoJSON, entering a token, and seeing the map render — all in <60 seconds.

**Phase 2: Multi-file layers + styling**
- **Goal**: Enable the multi-file comparison use case that's the real differentiator.
- **Scope**:
  - "Add File" action in the open map (toolbar button) to add more `.geojson` to the current map.
  - Layers panel inside the webview: list of loaded layers/groups with per-row view/hide, rename, delete, color (dropdown with 20-color preview), stroke width slider (0–50, default 3).
  - Group concept: select multiple layers → "Group" → assign one shared color; group has its own view/hide/rename/delete.
  - Color assignment: deterministic from a counter, user can override.
- **Success signal**: User can load 5 GeoJSON files into one map, group two of them, change one group's color, hide a layer, adjust stroke width — and the map reflects all changes live.

**Phase 3: Maps Manager + persistence** *(can run in parallel with Phase 4)*
- **Goal**: Saved projects survive across VS Code sessions.
- **Scope**:
  - Activity-bar contribution: custom map-pin icon, `mapsManager` view container.
  - `TreeDataProvider` reading `maps.json` from `globalStorageUri` (configurable via `mapsViewer.mapsLocation` setting).
  - "+" button in view title to save the currently-open map as a project (prompt for name).
  - Inline hover actions per tree item: Open, Rename, Delete.
  - Schema-versioned `maps.json`. Each project stores: `id`, `name`, `files[]` (paths), `layers[]` (per-layer: color, stroke width, visibility, group, name override), `basemap`, `view` (camera state), `primaryKeyByFile?`, `country?`.
  - On open: re-load all files, restore layer state, restore camera.
  - On open with missing files: badge file as missing, allow repath.
- **Success signal**: Save a project with 3 files + grouping + custom colors → restart VS Code → open from Maps Manager → identical state restored.

**Phase 4: Discovery features** *(can run in parallel with Phase 3)*
- **Goal**: The "find this record" workflow inside large files.
- **Scope**:
  - Primary-key picker per file/group: dropdown of property keys present in features, persists in project.
  - Locate command: command-palette quick-pick of PK values across visible layers → on select, map flies to feature and centers, briefly highlights it.
  - Country bounding-box setting per project: dropdown of countries (curated JSON of bboxes); on open, `map.fitBounds()` to chosen country; "World" as default.
  - Small-feature-as-dot: in `core`, compute feature length/area; add a parallel circle layer with `['case', ['all', ['<', ['get', '_lenM'], 100], ['<', ['zoom'], <calculated>]], visible, hidden]` so tiny features render as a 4px dot when zoomed out.
- **Success signal**: With a 10K-feature file open, pick a PK column, type a value into the Locate quick-pick, and the map flies to that feature.

**Phase 5: Polish + publish**
- **Goal**: Marketplace-ready extension.
- **Scope**: icon (256x256 + 128x128), README with GIFs, marketplace metadata (categories: Visualization, Other), CHANGELOG, decide on telemetry (likely opt-in only), perf sweep on a 50MB file, accessibility audit of webview UI controls, smoke-test installer build via `vsce package`, publish.
- **Success signal**: `vsce publish` succeeds; extension installs cleanly into a fresh VS Code and the Phase 1–4 user flows work as documented.

### Parallelism Notes

Phases 3 and 4 can run in parallel because they touch different surfaces: Phase 3 is the **Maps Manager sidebar + project file IO** (extension host), while Phase 4 is **inside the webview UI** (Locate quick-pick, country scoping, dot rendering). They share only the project schema, which is fixed at the end of Phase 2. Phases 0–2 and Phase 5 are strictly sequential.

---

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Target IDE | VS Code only for v1 | VS Code + Zed simultaneously | Zed's extension API is WASM/LSP-focused with no webview parity. Building both forces lowest common denominator; shared core leaves Zed feasible later. |
| Map engine | Mapbox GL JS (CSP-strict UMD bundle) | MapLibre GL + Protomaps; OpenLayers; Leaflet | User explicitly chose Mapbox. Mapbox styles already use OSM under the hood, satisfying the "OSM roads/buildings" requirement. CSP-strict bundle is the only viable Mapbox bundle in VS Code webviews. |
| Token strategy | BYO with guided first-run flow + `SecretStorage` | Shared embedded token (incumbent approach); MapLibre fallback | Shared token risks revocation and overage charges across all installs. BYO is one-time friction with a guided 60s flow. Incumbent (Geo Data Viewer, 200K installs) ships a hardcoded token in `src/config.ts:5` — proves it works but the long-term risk is real. |
| Basemap source | Mapbox `streets-v12` + `satellite-streets-v12` | Direct OSM tile server; MapTiler; Stadia; Esri World Imagery | Mapbox styles use OSM data, so we satisfy the OSM requirement without violating OSMF's tile policy (which would throttle a popular extension). |
| MVP scope | Phase 1 single-file only (right-click → map + hover + satellite) | Full multi-file from day one; everything in original list | Smaller MVP validates the core loop in ~1 weekend; multi-file (the differentiator) lands in Phase 2 quickly after. Avoids 3-month spec before any user feedback. |
| Project storage | Global-storage `maps.json` with `mapsLocation` setting | Workspace settings; SQLite; SettingsSync-only | Mirrors Project Manager extension (7.27M installs — proves the pattern works). Single JSON file is debuggable, portable, and sync-friendly via user-pointed location. |
| Timeline | 2–3 weeks of evenings/weekends (~40–60h) for MVP through Phase 3 | 1–2 weekends; 1–2 months full feature set | Comfortable pace allowing Phase 1 to ship and gather feedback while Phase 2–3 are built. Phase 4–5 land after. |
| Repo structure | pnpm workspaces, 4 packages (shared/core/webview/vscode) | Single package; lerna; nx | Clean boundaries: `core` is engine-agnostic + unit-testable, `webview` is browser-runnable for debugging, `vscode` is the thin adapter. pnpm is the user's chosen package manager. |
| Out of scope (firm) | Editing, other formats, export, 3D, live data, cloud sync, Zed | — | Scope discipline; every "and also" adds weeks. v1 is read-only multi-file GeoJSON viewer for VS Code. Period. |

---

## Research Summary

**Market Context**

Six VS Code GeoJSON viewer extensions exist; only one (Geometry Viewer, ~3K installs) claims multi-dataset support and it lacks grouping, persistence, hover popups, stroke control, and zoom-to-feature. The 200K-install market leader (Geo Data Viewer by RandomFractalsInc) hasn't shipped since January 2023, depends on Kepler.gl v2.5.5, and uses a single hardcoded Mapbox token (`src/config.ts:5`) — fragile and frozen. The second-place extension (Map Preview, 178K installs) is OpenLayers-based, single-file, no hover popup. **No current extension addresses multi-file comparison with persistence**, which is precisely the differentiated capability proposed here. The Project Manager extension by alefragnani (7.27M installs) provides a proven UX template for the Maps Manager sidebar (tree view + groups + inline hover actions + portable JSON storage).

Sources:
- [Geo Data Viewer Marketplace](https://marketplace.visualstudio.com/items?itemName=RandomFractalsInc.geo-data-viewer) / [GitHub](https://github.com/RandomFractals/geo-data-viewer)
- [VSCode Map Preview Marketplace](https://marketplace.visualstudio.com/items?itemName=jumpinjackie.vscode-map-preview)
- [Geometry Viewer Marketplace](https://marketplace.visualstudio.com/items?itemName=GeometryViewer.geometry-viewer)
- [Project Manager Marketplace](https://marketplace.visualstudio.com/items?itemName=alefragnani.project-manager) / [GitHub](https://github.com/alefragnani/vscode-project-manager)

**Technical Context**

Mapbox GL JS in VS Code webviews requires the **CSP-strict UMD bundle** (`mapbox-gl-csp.js` + `mapbox-gl-csp-worker.js`); the ESM bundle uses blob workers which are blocked by VS Code's webview CSP. Required CSP: `worker-src 'self'`, `connect-src https://*.mapbox.com`, `img-src https://*.mapbox.com data:`, `style-src 'unsafe-inline'`. WebGL works in webviews. Mapbox free tier is 50K map loads/month; BYO token is the only sustainable model. **OSMF's tile usage policy explicitly prohibits heavy/bulk use of `tile.openstreetmap.org`** — using Mapbox styles (which consume OSM-derived data) is the correct path. For hover highlight, use Mapbox feature-state with `generateId: true`. For performance with >10K features, `cluster: false` + tuned `maxzoom` works; tippecanoe vector tiles are an option if measured perf justifies it later. Maps Manager UX maps cleanly to `TreeDataProvider` + `menus."view/item/context"` with `"group": "inline"` for hover actions; storage in `globalStorageUri` mirroring Project Manager extension.

Sources:
- [Mapbox Security and testing (CSP bundle)](https://docs.mapbox.com/mapbox-gl-js/guides/security-and-testing/)
- [Mapbox CSP-strict PR #8044](https://github.com/mapbox/mapbox-gl-js/pull/8044)
- [Mapbox GL JS Pricing](https://docs.mapbox.com/mapbox-gl-js/guides/pricing/)
- [OSMF Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)
- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [VS Code Tree View API](https://code.visualstudio.com/api/extension-guides/tree-view)
- [Working with large GeoJSON in GL JS](https://docs.mapbox.com/help/troubleshooting/working-with-large-geojson-data/)

---

*Generated: 2026-05-29*
*Status: DRAFT — needs validation by building Phase 0 + Phase 1 and confirming the core right-click loop feels right.*
