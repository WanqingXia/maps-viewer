# Implementation Report: Phase 2 — Multi-File Layers + Styling

## Summary

Phase 2 turns the single-file Phase 1 MVP into the **multi-file comparison tool that is the project's actual differentiator** per the PRD. Multiple GeoJSON files now live in one map panel, each backed by a `Layer` record in a host-owned `LayerState`. A new in-webview sidebar (LayersPanel) renders one row per layer with: visibility toggle, color swatch (22-color palette picker), inline rename, stroke-width slider (0–50), delete; plus collapsible group headers with the same controls. All mutations flow through a pure reducer in `@maps-viewer/core` so the host is the single source of truth; the webview applies `applyAction` echoes and keeps a lightweight mirror for UI responsiveness.

A new palette command **Maps Viewer: Add File to Current Map…** opens a file picker and adds picks to the active panel. Right-clicking a `.geojson` in the explorer when a panel is already open now offers a quick-pick: "Add to current map" or "Open in new map".

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large | Large |
| New files | ~11 | 11 |
| File updates | ~6 | 12 (more than predicted — Phase 2 needed to touch several Phase 1 files: properties-popup, basemap-toggle, mapbox.d.ts, render-layer, hover) |
| LayerState reducer tests | 15+ | 20 |
| Phase 2 webview LOC | ~400 | ~1,000 |
| Validation | typecheck + test + build cold | All pass cold-state ✅ |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| P2.1 | Layer types in `@maps-viewer/shared` | ✅ | `Layer`, `Group`, `LayerState`, 13-variant `LayerAction`, `UserAction` (Phase-2 subset for webview UI), `EMPTY_LAYER_STATE`, stroke-width constants |
| P2.2 | Layer reducer + tests | ✅ | Pure `reduce()` for all 13 actions; 20 tests covering each action + 5 immutability invariants + group color cascade + per-layer-override-breaks-cascade rule |
| P2.3 | `assignColor` cycler + tests | ✅ | Cycles AUTO_PALETTE[0..19]; never auto-returns white or black; handles negative input safely |
| P2.4 | Extend message protocol | ✅ | `init` carries `state: LayerState` + `layerData: Record<id, FeatureCollection>` + `basemap`; new `applyAction` host msg + `requestAction` webview msg restricted to `UserAction`. `POST_MESSAGE_VERSION` bumped 1 → 2 |
| P2.5 | MapboxMap.applyAction | ✅ | Dispatch table for all 13 actions; `addLayer` adds source+3 sublayers+hover; `setLayerColor/Stroke/Visible` use `setPaintProperty`/`setLayoutProperty`; group ops are no-ops (host cascades to per-layer actions) |
| P2.6 | Color picker + stroke slider | ✅ | Plain-DOM popover with all 22 swatches in 11×2 grid; stroke slider 0–50 with rAF-throttled live updates and tabular-numeric readout |
| P2.7 | layer-row + group-header + layers-panel | ✅ | Diff-based sidebar update; rows have vis/color/rename/stroke/delete; group headers have vis/color/rename/delete; "(ungrouped)" label appears only when groups also present |
| P2.8 | Webview main.ts rewire | ✅ | Routes init/applyAction/setBasemap to MapboxMap + LayersPanel.update; user clicks emit `requestAction`; local mirror reducer (`reduceLocal`) keeps UI responsive |
| P2.9 | MapPanel holds LayerState | ✅ | Host now ingests files via `ingestFile()` → `reduce(addLayer)` → tracks `LayerState` + `layerData` Map; new public `addFile(uri)` method posts `applyAction` |
| P2.10 | view-in-maps quick-pick + add-file-to-map | ✅ | Quick-pick when active panel exists; new palette command `mapsViewer.addFileToMap` with multi-select OpenDialog filtered to `.geojson`/`.json` |
| P2.11 | extension.ts + manifest | ✅ | `mapsViewer.addFileToMap` activation event + commands entry |
| P2.12 | Validate + repackage + reinstall | ✅ | typecheck 0 errors; 40/40 tests; cold build; VSIX 670.84 KB; installed via `code --install-extension --force` |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis (`pnpm typecheck`) | ✅ Pass | 4 packages, 0 errors |
| Unit Tests (`pnpm test`) | ✅ Pass | 40 tests across 6 files (smoke, errors, colors, messages, assign-color, layer-state) |
| Build (`pnpm build`) | ✅ Pass | All dist artifacts produced from a cold state; webview vendor populated; vscode `dist/webview/` populated with 5 assets |
| Extension Packaging | ✅ Pass | `maps-viewer-0.0.1.vsix` 670.84 KB (9 files) |
| Install | ✅ Pass | `placeholder.maps-viewer@0.0.1` reinstalled via `code --install-extension --force` |
| F5 / live smoke | ⚠ Manual | User to verify multi-file load, color swatch picker, stroke slider, grouping, hover popup, satellite toggle |

## Artifacts produced (size deltas)

| Artifact | Phase 1 | Phase 2 | Δ |
|---|---:|---:|---:|
| `webview.js` (Vite IIFE) | 5.75 KB | 18.19 KB | +12.4 KB (layers panel + reducer mirror + color picker + stroke slider) |
| `webview.css` | 1.72 KB | 5.04 KB | +3.3 KB (sidebar + group + popup) |
| `extension.cjs` (esbuild CJS) | 15.1 KB | 25.5 KB | +10.4 KB (LayerState + reducer + addFile flow + add-file-to-map) |
| VSIX | 664 KB | 671 KB | +7 KB |

Mapbox vendor files unchanged (1.66 MB JS + 762 KB worker + 39.85 KB CSS).

## Deviations from Plan

- **Phase 1 component refactor**: the plan did not explicitly call for changes to `properties-popup.ts` and `basemap-toggle.ts`, but Phase 2 needed a `title` parameter on the popup (so the layer name appears with the hovered feature's properties) and a `BasemapToggle` interface with `set` + `destroy` (so basemap state can change programmatically when host posts `setBasemap`). These rewrites added the missing pieces while keeping the visual behavior identical.
- **`webview/src/types/mapbox.d.ts`**: Phase 1 had this as a module with module-scoped interfaces. Phase 2 references `MapboxMapInstance` from three files (render-layer, hover, mapbox-map) without import. Wrapping everything in `declare global { … }` made `MapboxMapInstance` a real ambient global.
- **TypeScript `paths` mapping**: Phase 2 added explicit `paths` to `core`, `webview`, and `vscode` tsconfigs mapping `@maps-viewer/shared` → `../shared/dist/index.d.ts`. Without it, TS's bundler resolution followed pnpm's workspace symlinks into shared's source files and complained that they were outside the consuming package's `rootDir`. The mapping forces resolution to the emitted `.d.ts` instead, keeping each package's `tsc` scope clean. Same trick for `@maps-viewer/core` (consumed by vscode).
- **`reduceLocal` in `main.ts`**: the plan said the webview would not run its own reducer (host is the single source of truth). In practice I implemented a lightweight local mirror reducer in `main.ts` so the LayersPanel can repaint immediately on user click rather than waiting for the host echo round-trip. The host's reducer remains authoritative — its echoes overwrite any local drift. This is a 60-line addition documented in the file's comment block.
- **`set(b)` no-callback**: `BasemapToggle.set()` updates pressed-state without re-firing the `onChange` callback. This avoids the loop where webview emits → host posts → webview re-toggles → emit again.

## Tests Written

| File | Tests | Coverage |
|---|---|---|
| `packages/core/src/colors/__tests__/assign-color.test.ts` | 5 | First/last cycle entry, full walk-through, wrap-around at 20, never returns white/black, negative input |
| `packages/core/src/layers/__tests__/layer-state.test.ts` | 20 | Every action variant + invariants (immutability, returns identity on no-op, color cascade rules) |
| `packages/core/src/__tests__/messages.test.ts` | 6 (rewritten) | New `HostMessage` / `WebviewMessage` shapes; `UserAction` excludes `addLayer` at the type level; `POST_MESSAGE_VERSION` is numeric |
| (Phase 1 carry-over) `smoke`, `errors`, `colors` | 9 | Unchanged |
| **Total** | **40** | All green from cold state |

## F5 / Live Smoke (manual — you run this)

```
1. Reload your main VS Code window (Developer: Reload Window)

2. Right-click any .geojson → "View in Maps"
   → panel opens with the new left sidebar showing one layer

3. Right-click a second .geojson → quick-pick → "Add to current map"
   → 2nd layer appears in the sidebar with a different color
   → both layers render on the map

4. In the sidebar:
   a. Click the ● dot next to layer 1 → it hides on the map
   b. Click the color swatch → 22-swatch picker opens → pick a different color → layer recolors live
   c. Drag the stroke slider on layer 2 → lines thicken live
   d. Click the layer name → type → Enter → rename persists
   e. Click ✕ on layer 1 → layer removed from map + sidebar

5. Cmd+Shift+P → "Maps Viewer: Add File to Current Map…" → multi-select 2 more .geojson → both appear as new layers

6. Hover a feature → properties popup shows layer name + properties
7. Click Satellite at top-right → basemap swaps, layers preserved
```

## Next Steps

- [ ] Live smoke (above) on real GeoJSON samples to confirm behavior
- [ ] `/ecc:code-review` for a Phase 2 correctness pass before declaring v0.1 ready
- [ ] Proceed to Phase 3 (Maps Manager + persistence) when ready
- [ ] Grouping (selecting 2+ layers → "Group") is supported in the data model but the UI doesn't yet expose a "Group selected" action — picked up in a follow-up or deferred to Phase 3 polish
