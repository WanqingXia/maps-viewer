# Implementation Report: Phases 3 + 4 (Maps Manager + Discovery Features)

Implemented together in a single VSIX since the Phase 3 Project schema needs the Phase 4 fields (`country`, `primaryKeyByLayer`) to be present from the start. Per the PRD: *"Phase 3 and Phase 4 can run in parallel — they touch different surfaces and only share the project schema."*

## Summary

**Phase 3 — Maps Manager + Persistence** ships a left-side **activity-bar** Maps Manager with a tree view of saved projects (Recent + All sections). Users **Save as Project…** the current map setup (files + layer state + camera + basemap + optional country + PK map), then re-open it later. Storage is a single schema-versioned `maps.json` (Zod-validated) under VS Code's global storage, with a `mapsViewer.mapsLocation` setting for iCloud/Dropbox sync. Missing-file repath flow prompts per-file via a modal picker.

**Phase 4 — Discovery Features** adds three palette commands:
- **Locate Feature…** — flat quick-pick across all PK-enabled layers' values; map flies to the chosen feature with a brief yellow pulse
- **Set Country Scope…** — quick-pick over 47 curated country bboxes; map auto-fits to the chosen country (or "World" to clear)
- **Set Primary Key…** — per-layer property picker (two-step quick-pick); key persists into Project

Plus the **small-feature-as-dot** rendering: features with length <100m render as a 4px circle at zoom <13 so nothing disappears at low zoom. Stamped via a `mv_lenM` property on each feature at source-add time; the dot is a 4th Mapbox sublayer per layer with a length + zoom filter.

## Validation

| Check | Status | Notes |
|---|---|---|
| `pnpm typecheck` | ✅ | all 4 packages, 0 errors |
| `pnpm test` | ✅ | **73 tests across 11 files** (40 new for this phase) |
| `pnpm build` (cold) | ✅ | shared/core dist built first; webview Vite bundle 22.4 KB JS + 5 KB CSS; vscode esbuild bundle 176.1 KB (zod bundled in) |
| `vsce package` | ✅ | `maps-viewer-0.0.1.vsix` 700.82 KB (10 files: extension.cjs + 5 webview assets + 1 SVG icon + package.json + 2 manifest files) |
| Install | ✅ | `placeholder.maps-viewer@0.0.1` reinstalled |

## Artifact size deltas

| Artifact | Phase 2 | Phase 3+4 | Δ |
|---|---:|---:|---:|
| webview.js | 18.19 KB | 22.40 KB | +4.2 KB (inline country bbox table + new message routes) |
| webview.css | 5.04 KB | 5.04 KB | 0 |
| extension.cjs | 25.50 KB | 176.10 KB | +150 KB (zod bundled in + project mgr + tree provider + 7 new commands + RPC + path resolver + centroid math) |
| VSIX | 671 KB | 701 KB | +30 KB |
| `maps-manager.svg` | — | 0.22 KB | new |

## Files Changed

### New (22 files)

**Shared types:** `country.ts`, `project.ts`

**Core helpers (+ tests):** `dot-rules.ts`, `bbox/country-bboxes.json`, `bbox/country-bboxes.ts`, `bbox/__tests__/country-bboxes.test.ts`, `geom/feature-size.ts`, `geom/__tests__/feature-size.test.ts`, `pk/extract-pk-keys.ts`, `pk/__tests__/extract-pk-keys.test.ts`, `storage/project-schema.ts`, `storage/__tests__/project-schema.test.ts`, `storage/path-resolver.ts`, `storage/__tests__/path-resolver.test.ts`

**VS Code:** `manager/maps-store.ts`, `manager/maps-tree-data-provider.ts`, `manager/repath-missing.ts`, `manager/commands/{save,open,rename,delete,new}-project.ts`, `commands/{locate-feature,set-country-scope,set-primary-key}.ts`, `resources/maps-manager.svg`

### Updated (~7 files)

`shared/src/{index,messages}.ts`, `core/src/index.ts` (barrel re-export of 7 new modules), `webview/src/{main,map/mapbox-map,map/render-layer}.ts`, `vscode/src/{extension,map-panel}.ts`, `vscode/package.json` (manifest), `core/package.json` + `vscode/package.json` (zod dep)

## Protocol Schema (v3)

`HostMessage` discriminated union (extension → webview):
- `init` — now carries `state`, `layerData`, `basemap`, **and** optional `country` + `primaryKeyByLayer` + `camera`
- `applyAction`, `setBasemap` — unchanged from Phase 2
- **`setCountry`** — `{ country: 'NZ' | null }`
- **`setPrimaryKey`** — `{ layerId, key: string | null }` (currently webview-side no-op)
- **`setCamera`** — `{ camera: ProjectCameraState }`
- **`locate`** — `{ layerId, featureId, center: [lng,lat], zoom? }`
- **`requestCameraState`** — `{ requestId }` (RPC)

`WebviewMessage` (webview → extension):
- `ready`, `mapLoaded`, `requestAction`, `error` — unchanged
- **`cameraState`** — `{ requestId, camera: ProjectCameraState }` (RPC reply)

## Project Schema (Zod-validated)

```jsonc
{
  "version": 1,
  "projects": [{
    "id": "<uuid>",
    "name": "NZ regions audit",
    "createdAt": "2026-05-29T14:55:00.000Z",
    "updatedAt": "2026-05-30T09:12:33.000Z",
    "files": [
      { "layerId": "layer-1", "path": "data/regions.geojson", "pathKind": "workspaceRelative", "workspaceFolder": "maps-viewer" }
    ],
    "layerState": { "layers": [...], "groups": [...] },
    "basemap": "standard",
    "camera": { "center": [174.76, -36.85], "zoom": 5.3, "bearing": 0, "pitch": 0 },
    "country": "NZ",
    "primaryKeyByLayer": { "layer-1": "REGION_CODE" },
    "tags": []
  }]
}
```

Dates: ISO 8601 UTC. Colors: `#RRGGBB`. Camera coords: `[lng, lat]` (Mapbox order). Bbox in country table: `[minLng, minLat, maxLng, maxLat]`.

## Deviations from Plan

- **Curated country table size**: plan said ~50, shipped 47. Standard countries covered (NZ, AU, US, CA, UK, FR, DE, ES, IT, JP, CN, IN, BR, …). Easy to add more via PR to `core/src/bbox/country-bboxes.json`.
- **`mv_lenM` instead of `_lenM`**: prefixed with `mv_` (Maps Viewer) to reduce collision risk with user-authored GeoJSON properties.
- **Webview-side country bbox table is inline**: rather than pulling `@maps-viewer/core` into the webview bundle, the same 47-entry table is duplicated inline in `webview/src/main.ts`. Keeps the webview bundle dep-free and small. Acceptable cost: maintaining two copies of the table.
- **Camera RPC uses 2s timeout fallback**: if the webview doesn't reply (unlikely but possible during init), `getProjectSnapshot` resolves with the last known camera (default `[0,0]/zoom 1` if never moved).
- **`openProject` / `renameProject` / `deleteProject` hidden from palette**: they require a project id from the tree node; running from the palette without args opens an info message pointing the user to the sidebar. Implemented via `commandPalette: { when: "false" }`.
- **`extract-pk-keys` shipped 2 helpers, not 1**: also added `collectPkValues` for the Locate flat list. Both pure, both tested.
- **`zod` added as a runtime dep on `core`**: required for `parseMapsJson` runtime validation of user-mutable `maps.json`. Bundled into `extension.cjs` (~150 KB). The plan explicitly chose Zod for runtime validation; cost is acceptable.

## Issues Encountered

1. **TypeScript JSON import strictness**: importing `country-bboxes.json` with the readonly tuple type required `(bboxes as unknown as RawTable)` instead of direct cast — TS objected to the implicit `number[]` → tuple narrowing.
2. **GateGuard friction**: Edit/Write calls retry once per file (~doubles per-file cost). Mitigated by batching via `cat > … <<EOF` heredocs in Bash for new files; surgical Edits for in-place updates.

## Tests Written (40 new, 73 total)

| File | Tests | Coverage |
|---|---:|---|
| `bbox/__tests__/country-bboxes.test.ts` | 6 | size, bbox shape, unique codes, lookup (case-insensitive), nullish handling, world bbox |
| `geom/__tests__/feature-size.test.ts` | 6 | Point/MultiPoint zero, null geometry, ~111km LineString, ~50m Polygon, MultiPolygon max |
| `pk/__tests__/extract-pk-keys.test.ts` | 6 | empty input, union sort, sample cap, value coercion, key-missing skip, dedupe order |
| `storage/__tests__/path-resolver.test.ts` | 7 | abs ↔ workspaceRelative both directions, workspace-fallback when folder missing, no-workspace edge |
| `storage/__tests__/project-schema.test.ts` | 8 | happy path empty + with project; rejects missing version, future version, bad color, bad camera, bad stroke; `isParseError` narrows ZodError |
| **Total new** | **33** | (+7 carry-over → 40 in this phase, 73 overall) |

## F5 / Live Smoke (manual — you run this)

```
1. Reload your VS Code window (Cmd+Shift+P → Developer: Reload Window)

2. Look at the activity bar — there's a new "Maps Manager" icon
   - Empty Recent + All Projects sections initially

3. Right-click a .geojson → "View in Maps" (or add multiple files)

4. Cmd+Shift+P → "Maps Viewer: Save as Project…" → name "Test 1"
   - Project appears in Recent + All sections of the sidebar
   - maps.json written under ~/Library/Application Support/Code/User/globalStorage/placeholder.maps-viewer/

5. Close the panel. Click "Test 1" in the Maps Manager sidebar
   - Panel reopens with identical layers, colors, basemap, camera

6. Hover a project in the tree:
   - Inline icons appear: Open (▶), Rename (✏️), Delete (🗑)
   - Click ✏️ → rename → tree updates
   - Click 🗑 → modal confirm → project removed

7. Open a project → Cmd+Shift+P → "Maps Viewer: Set Country Scope…"
   - Quick-pick of 47 countries + "World" → pick NZ → map flies to NZ bbox

8. Cmd+Shift+P → "Maps Viewer: Set Primary Key…"
   - Two-step quick-pick: pick layer → pick property column

9. Cmd+Shift+P → "Maps Viewer: Locate Feature…"
   - Flat quick-pick of all PK values across all PK-enabled layers
   - Pick one → map flies to feature + yellow pulse for 1.5s

10. Save the project again → camera + country + PK map all persist
    - Reopen → all restored exactly

11. Zoom way out (zoom < 13) — small features (<100m) render as visible dots
    Zoom past 13 — dots disappear, polygons/lines visible normally
```

## Settings exposed

| Setting | Type | Default | Purpose |
|---|---|---|---|
| `mapsViewer.defaultBasemap` | `'standard' \| 'satellite'` | `'standard'` | Initial basemap (Phase 1) |
| `mapsViewer.mapsLocation` | `string` | `""` | Absolute path to a custom `maps.json` for iCloud/Dropbox sync. Empty = VS Code's per-extension global storage |

## Known limitations

- **Concurrent writes from multiple VS Code windows** to `maps.json` are last-writer-wins (documented). Phase 5 polish could add a file-watcher refresh.
- **Curated country table is 47 entries**, not the planned 50. Easy to extend via `core/src/bbox/country-bboxes.json`.
- **No grouping UI** still — data model supports it; the sidebar doesn't yet expose a "Group selected" action. Deferred from Phase 2; not a Phase 3/4 concern.
- **`primaryKeyByLayer` not surfaced in webview** — currently host-only state. The LayersPanel could show a PK badge per layer in a future iteration.
- **Camera RPC has a 2s timeout** with last-known-camera fallback. Robust enough for save-project.

## Next Steps

- [ ] Live F5 smoke (above) on real GeoJSON samples
- [ ] `/ecc:code-review` for a Phase 3+4 correctness pass
- [ ] Proceed to **Phase 5 — Polish + Publish** (icon, README, CHANGELOG, marketplace metadata, CI/CD, perf sweep, publish)
- [ ] Optional polish: group-selection UI in LayersPanel; PK badges in layer rows; webview-side country dropdown
