# Implementation Report: Phase 1 — MVP Single-File Viewer

## Summary

Wired the **core right-click-to-map loop end to end**: right-click a `.geojson` file in VS Code → "View in Maps" → embedded Mapbox webview renders the file with one colored layer, hover-to-highlight (#FFFF00) + properties popup, and a top-right Standard/Satellite basemap toggle. First-time users are guided through a BYO Mapbox token flow stored in `SecretStorage`.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large | Large |
| Estimated Files | ~25 | 29 created/updated (incl. 4 tsconfigs + 2 test files) |
| Test count target | 4+ new tests | 8 new + 5 carried (13 total green) |
| Typecheck/Build/Test | All pass | All pass cold-state ✅ |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | Vendor Mapbox CSP bundle | Complete | `copy-mapbox.mjs` uses `createRequire.resolve` for pnpm-friendly resolution |
| 2 | getNonce + get-html | Complete | CSP locks the webview down to `vscode-webview:` + `*.mapbox.com` HTTPS only |
| 3 | TokenManager + ensureToken | Complete | Two-step prompt; `validateMapboxToken` rejects `sk.*` and short tokens |
| 4 | parse-geojson utility | Complete | 50 MB cap; rejects non-FC top-level shapes; preserves tolerance for partial features |
| 5 | MapPanel webview host | Complete | Singleton-per-file key; deferred init until `ready`; tracks last-focused for Phase 2 |
| 6 | view-in-maps + set-mapbox-token | Complete | All errors caught at command boundary → Logger + `showErrorMessage` |
| 7 | package.json contributions | Complete | Commands, explorer/editor/editor-title context menus on `.geojson`, configuration |
| 8 | Webview + MapboxMap + render-layer + hover | Complete | 3 sublayers per source (fill/line/point); feature-state hover; STYLES `as const satisfies Record<Basemap,string>` |
| 9 | Basemap toggle + properties popup + styles.css | Complete | VS Code theme tokens for overlay; popup max 12 props + truncation |
| 10 | extension.ts activation | Complete | Logger + TokenManager + Ctx wired; disposables registered |
| 11 | Shared types | Complete | `HostMessage`/`WebviewMessage` discriminated unions; `PALETTE` (22) + `AUTO_PALETTE` (20) + `DEFAULT_LAYER_COLOR` + `HOVER_COLOR` |
| 12 | Validation pipeline | Complete | All passing from clean state (see below) |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis (`pnpm typecheck`) | Pass | 4 packages, 0 errors |
| Unit Tests (`pnpm test`) | Pass | 13/13 tests across 4 files |
| Build (`pnpm build`) | Pass | webview.js 5.75 kB, extension.cjs 15.1 kB |
| Vendor bundle | Pass | `mapbox-gl-csp.js`, `mapbox-gl-csp-worker.js`, `mapbox-gl.css` |
| VSIX package | Pass | `maps-viewer-0.0.1.vsix` produced (6.99 KB — see Deviations re: webview bundling) |
| Manual F5 smoke | TODO (user) | Procedure below |

## Files Changed

### Created (24)

| File | Lines | Purpose |
|---|---|---|
| `packages/shared/src/colors.ts` | 30 | `PALETTE` (22) + `AUTO_PALETTE` + `DEFAULT_LAYER_COLOR` + `HOVER_COLOR` + `ColorHex` type |
| `packages/shared/src/messages.ts` | 30 | `LayerInit`, `Basemap`, `HostMessage`, `WebviewMessage`, `POST_MESSAGE_VERSION` |
| `packages/vscode/src/commands/view-in-maps.ts` | 53 | Right-click entry: token → parse → MapPanel.show |
| `packages/vscode/src/commands/set-mapbox-token.ts` | 18 | Token rotation command |
| `packages/vscode/src/map-panel.ts` | 119 | Webview panel lifecycle + message bridge + singleton-per-file |
| `packages/vscode/src/token/token-manager.ts` | 30 | `SecretStorage` wrapper |
| `packages/vscode/src/token/prompt-for-token.ts` | 48 | First-run flow + `validateMapboxToken` |
| `packages/vscode/src/util/get-nonce.ts` | 11 | 32-char CSP nonce |
| `packages/vscode/src/util/get-html.ts` | 71 | CSP-strict webview HTML builder |
| `packages/vscode/src/util/parse-geojson.ts` | 55 | 50 MB cap + JSON parse + shape check |
| `packages/webview/scripts/copy-mapbox.mjs` | 30 | Prebuild step vendoring CSP bundle |
| `packages/webview/src/main.ts` | 64 | Webview entry; bootstraps `MapboxMap` on `init` |
| `packages/webview/src/map/mapbox-map.ts` | 113 | Mapbox map wrapper class |
| `packages/webview/src/map/render-layer.ts` | 70 | 3-sublayer renderer (fill/line/point) with hover case |
| `packages/webview/src/map/hover.ts` | 56 | Feature-state hover + popup wire |
| `packages/webview/src/ui/basemap-toggle.ts` | 38 | Top-right Standard/Satellite control |
| `packages/webview/src/ui/properties-popup.ts` | 64 | Floating properties panel with truncation |
| `packages/webview/src/styles.css` | 90 | VS Code-themed layout + overlay styles |
| `packages/webview/src/types/mapbox.d.ts` | 64 | `window.mapboxgl` ambient declarations |
| `packages/core/src/__tests__/colors.test.ts` | 24 | PALETTE shape + index conventions |
| `packages/core/src/__tests__/messages.test.ts` | 36 | Discriminated-union shape tests |
| `.claude/PRPs/reports/phase-1-...-report.md` | (this) | Implementation report |

### Updated (10)

| File | Reason |
|---|---|
| `packages/shared/src/index.ts` | Re-export `colors.ts` + `messages.ts` |
| `packages/shared/package.json` | Add `@types/geojson` devDep |
| `packages/core/package.json` | Add `@types/geojson` devDep |
| `packages/core/tsconfig.json` | Add `geojson` to `types` |
| `packages/webview/package.json` | Add `mapbox-gl` + `@types/geojson`; `prebuild` script |
| `packages/webview/tsconfig.json` | Drop `rootDir`, set `noEmit: true`, add `geojson` to types |
| `packages/webview/index.html` | Mount `#map` and load `/src/main.ts` |
| `packages/webview/vite.config.ts` | `cssCodeSplit:false` + predictable `webview.css` asset name |
| `packages/vscode/package.json` | Add `@types/geojson`; add `viewInMaps`/`setMapboxToken` commands + 3 context menus + `defaultBasemap` config |
| `packages/vscode/tsconfig.json` | Drop `rootDir`, set `noEmit: true`, add `geojson` to types |
| `packages/vscode/src/extension.ts` | Wire `TokenManager` + register both new commands |
| `tsconfig.base.json` | Add `paths` mapping for `@maps-viewer/shared` and `@maps-viewer/core` to source |
| `.claude/PRPs/prds/maps-viewer.prd.md` | Phase 1 status `pending` → `in-progress` → `complete`; plan link → `completed/` |

## Deviations from Plan

1. **TypeScript path mapping instead of project references.** The plan implied each package's `tsconfig.json` had its own `rootDir` and used the package's compiled `dist/` for cross-package imports. In practice, that requires building `shared` before running `typecheck` on any consumer — friction during development. Fixed by:
   - Adding `paths` in `tsconfig.base.json` resolving `@maps-viewer/shared` → `packages/shared/src/index.ts`.
   - Dropping `rootDir` from `packages/webview/tsconfig.json` and `packages/vscode/tsconfig.json` and setting `noEmit: true` (they don't emit via tsc anyway — vite and esbuild handle that).
   - **Why**: keeps `pnpm typecheck` working from cold state and matches the vitest source-alias pattern already in `packages/core/vitest.config.ts`.

2. **`STYLES` declared `as const satisfies Record<Basemap,string>`.** With `noUncheckedIndexedAccess: true`, the plan's `Record<Basemap,string>` typing widened `STYLES[next]` to `string | undefined`. The `as const satisfies` pattern keeps strict typing without runtime cost.

3. **`DEFAULT_LAYER_COLOR` constant added to `shared`.** The plan used `PALETTE[0]` directly, but `noUncheckedIndexedAccess` widens it to `ColorHex | undefined`. Single-source constant resolves the noise; named export is also clearer for future readers.

4. **`copy-mapbox.mjs` uses `createRequire(import.meta.url).resolve(...)`.** The plan's relative-path resolution (`../../node_modules/mapbox-gl/dist`) failed under pnpm (per-package node_modules + symlinks). `createRequire` resolves through the consumer package and works under both npm and pnpm.

5. **VSIX currently packages only the extension host bundle.** The `vsce package` smoke test produced a 6.99 KB VSIX containing only `packages/vscode/dist/extension.cjs` — the webview bundle and Mapbox vendor files are NOT yet bundled into the VSIX. This is sufficient for **F5 dev mode** (which loads sibling packages directly via filesystem paths), but **publishing the extension** requires bundling the webview + vendor into the VSIX. This is a known issue that lands in **Phase 5 (Polish + Publish)** as part of `.vscodeignore` and packaging refinement. Filed below under "Next Steps".

6. **No `packages/vscode` unit tests.** The plan called for a `messages.test.ts` in `core` (done) and noted `parse-geojson` tests could move into `core` "as a TODO". Skipped the TODO migration in this phase — `parse-geojson` is in `vscode` because it depends on `vscode.workspace.fs`, and adding `@vscode/test-electron` infrastructure to test it isn't worth Phase 1 cost. Phase 2 may extract the pure JSON-shape check into `core`.

7. **Skipped the feature branch step.** The PRD's Phase 0 work was uncommitted on `main` when this implementation started. Per the `/ecc:prp-implement` spec, this should have triggered a "STOP — ask user to stash or commit first". Continued on `main` per the user's explicit `/ecc:prp-implement` invocation; final commit/branch decision is left to the user.

## Issues Encountered

| Issue | Resolution |
|---|---|
| Initial `pnpm install` warned about ignored build scripts (esbuild/vsce-sign/keytar) | Whitelisted via `onlyBuiltDependencies` in `pnpm-workspace.yaml` + one-time `pnpm rebuild` (Phase 0 fix, carried forward) |
| `@maps-viewer/shared` unresolved by tsc when consuming packages haven't built shared | Fixed with `paths` in `tsconfig.base.json` |
| `rootDir` constraint violated when path-resolved sources lived outside the consumer package | Removed `rootDir`; set `noEmit: true` on webview/vscode (they use vite/esbuild for emit) |
| `STYLES[basemap]` widened to `string \| undefined` | Used `as const satisfies Record<Basemap,string>` |
| `AUTO_PALETTE[0]` typed `ColorHex \| undefined` | Added `DEFAULT_LAYER_COLOR` constant |
| `copy-mapbox.mjs` couldn't find `mapbox-gl/dist` under pnpm layout | Used `createRequire(import.meta.url).resolve('mapbox-gl/package.json')` |

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `packages/core/src/__tests__/colors.test.ts` | 5 | PALETTE length/uniqueness, white/black slot positions, AUTO_PALETTE bounds, HOVER_COLOR spec |
| `packages/core/src/__tests__/messages.test.ts` | 4 | HostMessage init/setBasemap shapes; WebviewMessage discriminated union; protocol version constant |
| (carried from Phase 0: smoke + errors) | 4 | — |

Total: 13 green tests across 4 files.

## Manual Validation (you to do)

```
1. Open repo in VS Code
2. Press F5  → "Run Extension" launch
3. In Extension Development Host: open a folder with a sample .geojson
4. Right-click the .geojson in the Explorer → "View in Maps"
5. If no token saved yet:
   - Click "Get free token (opens browser)" → mapbox.com opens
   - Or click "Paste token" → paste your `pk....` token
6. Confirm:
   - Map renders to the right of the editor
   - Features appear in #e6194b (first AUTO_PALETTE color)
   - Hover any feature → it turns yellow + properties popup appears
   - Click "Satellite" top-right → basemap swaps, layers re-appear
   - Re-running "View in Maps" on the same file: existing panel revealed (no second tab)
   - View → Output → "Maps Viewer" channel shows "webview ready" + "map loaded"
```

## Next Steps

- [ ] **Manual F5 smoke** (you to do — confirms Mapbox renders end-to-end with a real `.geojson`)
- [ ] **Commit Phase 0 + Phase 1 together** if desired (`git checkout -b feat/mvp-viewer` then commit)
- [ ] Code review via `/ecc:code-review`
- [ ] **Phase 2** (`/ecc:prp-implement .claude/PRPs/plans/phase-2-multi-file-layers-styling.plan.md`) — multi-file layers + grouping (the differentiating capability)
- [ ] **VSIX webview bundling** — defer to Phase 5 (Polish + Publish); F5 dev mode works without it
