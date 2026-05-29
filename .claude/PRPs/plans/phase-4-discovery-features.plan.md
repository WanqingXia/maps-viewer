# Plan: Phase 4 — Discovery Features

## Summary

Add the "find this record" workflow that turns the viewer into a usable inspection tool for large GeoJSON files. Four discrete sub-features, all sharing the `Project` schema established in Phase 3:

1. **Primary-key selection** — choose a property as the layer's ID column
2. **Locate** — command-palette quick-pick of PK values; map flies to and highlights the selected feature
3. **Country scoping** — per-project country selector (default world) that auto-fits to a curated bbox
4. **Small-feature-as-dot** — features <100m at low zoom render as visible 4px dots so nothing disappears

**Can run in parallel with Phase 3** — different surfaces; only the project schema (frozen in Phase 3) is shared.

## User Story

As a **GIS engineer with a 10K-feature file**, I want to **type a record ID and jump to it**, **scope the map to a single country to skip irrelevant tiles**, and **see small features as dots when zoomed out**, so that **I can locate records and confirm coverage without scrolling through thousands of shapes**.

## Problem → Solution

After Phase 3, a project opens and shows everything at once — fine for small files, unwieldy at 10K features, confusing when features are sub-meter. Phase 4 adds the discovery toolkit.

## Metadata

- **Complexity**: Medium-Large (4 sub-features, each self-contained)
- **Source PRD**: `.claude/PRPs/prds/maps-viewer.prd.md`
- **PRD Phase**: Phase 4 — Discovery features (parallel with Phase 3)
- **Estimated Files**: ~14

## Data Structure (synthetic example for review)

Curated country bboxes — `packages/core/src/bbox/country-bboxes.json`:
```jsonc
{
  "version": 1,
  "countries": [
    { "code": "NZ", "name": "New Zealand",   "bbox": [165.86, -47.29, 178.91, -34.39] },
    { "code": "US", "name": "United States", "bbox": [-125.00,  24.40, -66.93,  49.38] },
    { "code": "AU", "name": "Australia",     "bbox": [112.92, -43.74, 153.64, -10.06] }
    // ... ~50 entries
  ]
}
```

Bbox format: **[minLng, minLat, maxLng, maxLat]** (Mapbox convention).

---

## UX Design

### Before (Phase 3)
```
Project: NZ regions audit
  Map opens at world view (or last camera)
  Looking for region code "ARC-205"? scroll, zoom, squint
  Sub-meter features in dense areas: invisible at low zoom
```

### After
```
┌──────────────────────────────────────────────────────────────┐
│ Project: NZ regions audit                  [Country: NZ ▾]   │
│  Layers (3)   |    (Mapbox map zoomed to NZ bbox)            │
│   ● Districts |    [tiny features render as dots when        │
│   ● Regions   |     zoomed out beyond cm:500m]               │
│   ● Centers   |                                              │
│                                                              │
│  Layer "Regions" PK: REGION_CODE  ⌘P → "Locate ARC-205"      │
└──────────────────────────────────────────────────────────────┘
```

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| Country selector | n/a | Top-right dropdown beside basemap toggle | Persisted to Project |
| Locate | n/a | Cmd+Shift+P → "Maps Viewer: Locate Feature" → quick-pick of PK values | Per-layer |
| PK setting | n/a | Per-layer dropdown in Layers Panel | Property keys auto-extracted |
| Small features | invisible at low zoom | 4px dot when length<100m AND zoom<13 | Computed once on layer add |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `.claude/PRPs/plans/phase-3-maps-manager-persistence.plan.md` | PROJECT_SCHEMA | `country` + `primaryKeyByLayer` already in schema |
| P0 | `packages/shared/src/layer.ts` | all | LayerState consumed |
| P0 | `packages/webview/src/map/render-layer.ts` | all | Will gain dot layer |
| P1 | `packages/vscode/src/map-panel.ts` | all | Adds PK + country setters |
| P2 | https://docs.mapbox.com/mapbox-gl-js/api/map/#map#flyto | flyTo / fitBounds | Animation options |

## External Documentation

| Topic | Source | Key Takeaway |
|---|---|---|
| flyTo / fitBounds | https://docs.mapbox.com/mapbox-gl-js/api/map/#map#flyto | `{ center, zoom, padding, duration }` |
| Mapbox 'zoom' expression | https://docs.mapbox.com/style-spec/reference/expressions/#zoom | `['<', ['zoom'], N]` for conditional rendering |
| @turf/length | https://turfjs.org/docs/api/length | LineString length in meters/km |
| @turf/bbox | https://turfjs.org/docs/api/bbox | Feature bbox; max(width,height) used as size |

---

## Patterns to Mirror

- **LAYER_STATE_MODEL** (Phase 2), **PROJECT_SCHEMA** (Phase 3)
- **WEBVIEW_MESSAGE_PROTOCOL** (Phase 1) — extend with `locate`, `setCountry`, `setPrimaryKey`

## New patterns this phase introduces

### COUNTRY_BBOX_TABLE
Shipped as `packages/core/src/bbox/country-bboxes.json`. ~50 countries by user-projected need; user can request additions via GitHub issue. ISO 3166-1 alpha-2 codes.

### FEATURE_SIZE_METRIC (pure, in `core`)
Precompute `_lenM` (meters) on `addLayer`:
- `Point` / `MultiPoint`: 0 (never collapsed)
- `LineString` / `MultiLineString`: turf-length
- `Polygon` / `MultiPolygon`: max(bbox_width_m, bbox_height_m) via haversine

Threshold for "small": `_lenM < 100`. Threshold for "low zoom": `map.getZoom() < 13` (≈ 1cm:500m). Constants in `core/dot-rules.ts`.

### LOCATE_INDEX (built per layer, cached)
On adding a layer with PK set, build `Map<pkValue, mapboxFeatureId>` + `Map<pkValue, [lng,lat]>` (centroid). Stored in webview only; never persisted.

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `/packages/shared/src/messages.ts` | UPDATE | Add `locate`, `setCountry`, `setPrimaryKey` messages |
| `/packages/shared/src/country.ts` | CREATE | `CountryCode`, `CountryBbox` types |
| `/packages/core/src/bbox/country-bboxes.json` | CREATE | Curated ~50-country bbox table |
| `/packages/core/src/bbox/country-bboxes.ts` | CREATE | Typed loader + lookup |
| `/packages/core/src/bbox/__tests__/country-bboxes.test.ts` | CREATE | Schema + lookup tests |
| `/packages/core/src/geom/feature-size.ts` | CREATE | `featureLenM(feature): number` |
| `/packages/core/src/geom/__tests__/feature-size.test.ts` | CREATE | Tests for each geometry type |
| `/packages/core/src/dot-rules.ts` | CREATE | `SMALL_FEATURE_M = 100`, `DOT_ZOOM_THRESHOLD = 13` |
| `/packages/core/src/pk/extract-pk-keys.ts` | CREATE | `extractPropertyKeys(features): string[]` |
| `/packages/core/src/pk/__tests__/extract-pk-keys.test.ts` | CREATE | Tests |
| `/packages/vscode/src/commands/locate-feature.ts` | CREATE | Quick-pick across PK-enabled layers |
| `/packages/vscode/src/commands/set-primary-key.ts` | CREATE | Per-layer PK picker |
| `/packages/vscode/src/commands/set-country-scope.ts` | CREATE | Country quick-pick |
| `/packages/vscode/src/map-panel.ts` | UPDATE | Wire commands; persist country + PKs |
| `/packages/webview/src/main.ts` | UPDATE | Route new messages |
| `/packages/webview/src/map/dot-layer.ts` | CREATE | Adds dot sublayer |
| `/packages/webview/src/map/mapbox-map.ts` | UPDATE | `setCountry`, `flyToFeature`, locateIndex |
| `/packages/webview/src/map/render-layer.ts` | UPDATE | Stamp `_lenM` on features before adding source |
| `/packages/webview/src/ui/country-dropdown.ts` | CREATE | Top-right country selector |
| `/packages/webview/src/ui/layers-panel.ts` | UPDATE | PK dropdown in layer rows |

## NOT Building

- Free-text country search (only ~50 curated dropdown entries)
- Heatmap / cluster rendering — defer
- Compound PKs (multiple property keys) — defer
- Auto-detect PK by uniqueness — defer
- Locate UI inside webview (palette only)

---

## Step-by-Step Tasks

### Task 1: Country bbox table
- **ACTION**: Curate ~50 countries; ship as JSON in `core`
- **IMPLEMENT** loader:
  ```ts
  // packages/core/src/bbox/country-bboxes.ts
  import bboxes from './country-bboxes.json' with { type: 'json' };
  export interface CountryBbox { code: string; name: string; bbox: [number,number,number,number] }
  export const COUNTRY_BBOXES: ReadonlyArray<CountryBbox> = bboxes.countries;
  export function findCountry(code: string): CountryBbox | undefined {
    return COUNTRY_BBOXES.find(c => c.code === code);
  }
  ```
- **GOTCHA**: `with { type: 'json' }` is Node 22 syntax. Fall back to `.ts` re-export if the toolchain rejects it.
- **VALIDATE**: Lookup tests for NZ, US, AU.

### Task 2: Feature size metric
- **ACTION**: Pure function in `core/geom/feature-size.ts`
- **IMPLEMENT**:
  ```ts
  import { length as turfLength } from '@turf/length';
  import { bbox as turfBbox } from '@turf/bbox';
  import type { Feature } from 'geojson';

  export function featureLenM(f: Feature): number {
    if (!f.geometry) return 0;
    switch (f.geometry.type) {
      case 'Point': case 'MultiPoint': return 0;
      case 'LineString': case 'MultiLineString':
        return turfLength(f, { units: 'meters' });
      case 'Polygon': case 'MultiPolygon': {
        const [w, s, e, n] = turfBbox(f);
        const widthM = haversine(s, w, s, e);
        const heightM = haversine(s, w, n, w);
        return Math.max(widthM, heightM);
      }
      default: return 0;
    }
  }
  function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000, toRad = (d: number) => d * Math.PI / 180;
    const dLat = toRad(lat2-lat1), dLng = toRad(lng2-lng1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  ```
- **GOTCHA**: Import `@turf/length` and `@turf/bbox` individually (~3KB each). Don't import `@turf/turf` (huge).

### Task 3: PK extraction
- **ACTION**: Union property keys across a sample of features
- **IMPLEMENT**:
  ```ts
  export function extractPropertyKeys(features: ReadonlyArray<Feature>, sampleSize = 100): string[] {
    const keys = new Set<string>();
    const limit = Math.min(features.length, sampleSize);
    for (let i = 0; i < limit; i++) {
      const props = features[i]?.properties;
      if (props) for (const k of Object.keys(props)) keys.add(k);
    }
    return [...keys].sort();
  }
  ```

### Task 4: Dot layer
- **ACTION**: Add 4th sublayer (`circle`) visible only when small AND zoomed out
- **IMPLEMENT**: In `render-layer.ts`, before adding source, walk features and stamp `feature.properties._lenM = featureLenM(feature)`. Then:
  ```ts
  map.addLayer({
    id: `${layerId}-dot`,
    type: 'circle',
    source: layerId,
    paint: {
      'circle-radius': 4,
      'circle-color': ['case', ['boolean', ['feature-state','hover'], false], '#FFFF00', layer.color],
      'circle-opacity': 1,
    },
    filter: ['<', ['get', '_lenM'], 100],
    minzoom: 0, maxzoom: 13,
  });
  ```
- **GOTCHA**: Stamp `_lenM` BEFORE handing geometry to Mapbox (source is treated as immutable thereafter).
- **GOTCHA**: Visual overlap at high zoom is fine because the dot's `maxzoom: 13` removes it; no need to also filter the fill/line layers.

### Task 5: Persist country + PK in Project
- **ACTION**: Schema already supports both fields (Phase 3) — no schema change
- **IMPLEMENT**: `saveProject` snapshots include `country` + `primaryKeyByLayer`. Open restores both.

### Task 6: `setCountryScope` command
- **ACTION**: Quick-pick → post `setCountry` to webview
- **IMPLEMENT**:
  ```ts
  export async function setCountryScope(panel: MapPanel) {
    const items = [
      { label: 'World', description: '(no scoping)', value: '' },
      ...COUNTRY_BBOXES.map(c => ({ label: c.name, description: c.code, value: c.code })),
    ];
    const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Pick a country to scope the map' });
    if (!pick) return;
    panel.setCountry(pick.value);
  }
  ```
  Webview: `setCountry(code)` → `fitBounds(bbox, { padding: 40 })` (or world if `code === ''`).

### Task 7: `setPrimaryKey` command
- **ACTION**: Per-layer PK picker
- **IMPLEMENT**:
  ```ts
  export async function setPrimaryKey(panel: MapPanel) {
    const layerPick = await pickLayer(panel.layerState.layers, 'Choose a layer');
    if (!layerPick) return;
    const features = panel.layerData.get(layerPick.id)?.features ?? [];
    const keys = extractPropertyKeys(features);
    if (!keys.length) { void vscode.window.showWarningMessage('Layer has no properties.'); return; }
    const keyPick = await vscode.window.showQuickPick(keys, { placeHolder: `Primary key for "${layerPick.displayName}"` });
    if (!keyPick) return;
    panel.setPrimaryKey(layerPick.id, keyPick);
  }
  ```

### Task 8: `locateFeature` command
- **ACTION**: Quick-pick PK values across PK-enabled layers → fly + pulse
- **IMPLEMENT**: Build flat list `[{ layerId, layerName, pk, pkValue }]` from all layers with PKs set. On pick, post `locate` to webview.
- **IMPLEMENT** (webview):
  ```ts
  flyToFeature(layerId: string, pkValue: string) {
    const featureId = this.locateIndex.get(layerId)?.get(pkValue);
    const center = this.centroids.get(layerId)?.get(pkValue);
    if (featureId == null || !center) return;
    this.map.flyTo({ center, zoom: 14, duration: 800 });
    this.map.setFeatureState({ source: layerId, id: featureId }, { hover: true });
    setTimeout(() => this.map.setFeatureState({ source: layerId, id: featureId }, { hover: false }), 1500);
  }
  ```
- **GOTCHA**: Mapbox `generateId: true` produces deterministic ints 0..N-1 in feature-array order. Build the index by iterating GeoJSON, NOT by `querySourceFeatures` (which only returns features in current viewport).
- **GOTCHA**: Compute centroid per feature on layer-add (turf-centroid) — cheap, avoids per-Locate work.

### Task 9: Wire `MapPanel` setters
- **ACTION**: Methods `setCountry`, `setPrimaryKey`, `locate` post host messages; update internal state for project snapshot.

### Task 10: Tests
- **ACTION**: Pure functions get unit tests
- **VALIDATE**: 100% branch coverage on `featureLenM`, `findCountry`, `extractPropertyKeys`

---

## Testing Strategy

### Unit Tests (Vitest in `core`)

| Test | Input | Expected | Edge Case? |
|---|---|---|---|
| `featureLenM`: Point | `{type:'Point',...}` | 0 | yes |
| `featureLenM`: LineString 100km | known coords | ~100000 | no |
| `featureLenM`: tiny Polygon | 50m × 50m at NZ | ~50 | yes |
| `featureLenM`: null geometry | feature.geometry = null | 0 | yes |
| `findCountry`: NZ | "NZ" | object with bbox | no |
| `findCountry`: unknown | "XX" | undefined | yes |
| `extractPropertyKeys`: empty | [] | [] | yes |
| `extractPropertyKeys`: heterogeneous | mixed keys | union sorted | yes |

### Edge Cases Checklist
- [ ] PK absent on some features → Locate skips silently
- [ ] Locate value not found → friendly "No feature matched"
- [ ] Country='' (World) → fitBounds `[-180,-85,180,85]`
- [ ] Country=NZ, no features in NZ → zooms to NZ anyway (geographical scope, not data extent)
- [ ] `_lenM = 99.9` → dot at low zoom
- [ ] `_lenM = 100` → renders normally (strict `<`)
- [ ] Mixed Point + Polygon layer → points always render; polygons collapse to dot only when small + low zoom
- [ ] Country not in bbox table → fallback to world + warn

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
EXPECT: All packages build

### Extension Host Smoke
```
1. F5
2. Open a project (or fresh file) with NZ regions
3. Cmd+Shift+P → "Maps Viewer: Set Country Scope" → "New Zealand" → fits to NZ
4. Layers Panel: pick layer "Regions" → set PK → "REGION_CODE"
5. Cmd+Shift+P → "Maps Viewer: Locate Feature" → type "ARC-205" → flies, pulses yellow 1.5s
6. Zoom out to z=10 → tiny features render as dots
7. Zoom in past z=13 → dots gone, polygons/lines visible
8. Save project → reopen → country + PK persist
```

### Manual Validation
- [ ] All 4 sub-features work independently
- [ ] `country` + `primaryKeyByLayer` persist via saveProject
- [ ] No perf regression on 10K-feature file

---

## Acceptance Criteria
- [ ] Country dropdown / command works; fits to chosen country
- [ ] Locate flies to feature + briefly highlights
- [ ] Per-layer PK selectable, persists
- [ ] Small features render as dots (<100m AND zoom<13)
- [ ] All four sub-features round-trip through Project schema

## Completion Checklist
- [ ] `_lenM` stamped once at source load
- [ ] `locateIndex` built once per layer
- [ ] No `console.log`
- [ ] Country bbox JSON has ≥30 entries (target 50)
- [ ] Dot threshold constants in `core/dot-rules.ts`

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `_lenM` slow on 50K+ features | Medium | Medium | Stream-compute on add; progress notification for >10K |
| PK with non-string values | High | Low | `String(value)` keys |
| Mapbox ids don't match index | Low | High | Deterministic array-index iteration; verify with test |
| Country bbox table too sparse | Medium | Low | Document; accept GitHub issues |
| Dot threshold visually off | Low | Low | Tunable via `mapsViewer.smallFeatureZoomThreshold` setting (Phase 5) |
| Locate quick-pick slow on huge lists | Medium | Medium | VS Code QuickPick handles incremental filtering well |

## Notes

- **Why not auto-detect PK?** Unreliable on partial data; explicit user choice is safer for v1.
- **Why curated bbox not a library?** `world-atlas` is 1MB+; ~50 bboxes is 4KB.
- **Why command palette for Locate not webview UI?** VS Code QuickPick has best incremental search and accessibility. May add webview-side search in Phase 5+.
- **`_lenM = 100` threshold** is the PRD literal spec. Constant, tunable later.
