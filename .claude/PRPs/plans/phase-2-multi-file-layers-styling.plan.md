# Plan: Phase 2 — Multi-File Layers + Styling

## Summary

Turn the single-file MVP into the **multi-file comparison tool that's the real differentiator**. Add the ability to load multiple GeoJSON files into one map, organize them into groups (each with a shared color from the 20-palette), and control them through an in-webview Layers Panel offering per-layer view/hide/rename/delete, color selection, and stroke width adjustment (0–50, default 3). This phase ships the **core hypothesis** validator.

## User Story

As a **GIS engineer comparing several GeoJSON outputs**, I want to **load multiple files into one map with distinct colors, group related files, and tune each layer's appearance**, so that **I can visually spot overlaps, gaps, and discrepancies between datasets in a single view**.

## Problem → Solution

After Phase 1, the only way to see two files together is to open two `MapPanel`s side-by-side — no comparison, no shared coordinate system, no grouping. Phase 2 introduces a layer-management model where many files live in one panel, sharing colors by group and switchable in/out independently.

## Metadata

- **Complexity**: Large
- **Source PRD**: `.claude/PRPs/prds/maps-viewer.prd.md`
- **PRD Phase**: Phase 2 — Multi-file layers + styling
- **Estimated Files**: ~18

---

## UX Design

### Before (Phase 1)
```
┌─────────────────────────────────────────────────────────┐
│ Maps Viewer: regions.geojson                            │
│  [Standard] [Satellite]                                 │
│                                                         │
│       (Mapbox map, one file, one color)                 │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### After
```
┌─────────────────────────────────────────────────────────────────────┐
│ Maps Viewer: regions.geojson                  [+ Add File]          │
│  ┌──────────────────────────────────┬──────────────────────────────┐│
│  │ Layers (3)            [Standard] [Sat]                          ││
│  │ ───────────────────────────────────                             ││
│  │ ▾ Group: Boundaries  ●  [⋯]                                     ││
│  │     ☑ districts.geojson  ●  rename, delete                      ││
│  │     ☑ regions.geojson    ●  rename, delete                      ││
│  │ ────                                                            ││
│  │ ▾ (ungrouped)                                                   ││
│  │     ☐ test-points.geojson  ●  [▸ color  ▸ stroke 5]             ││
│  │                                                                 ││
│  │              (Mapbox map with all visible layers)               ││
│  └──────────────────────────────────┴──────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| Right-click `.geojson` on a map already open | New panel | Choice: "Open in new map" / "Add to current map" | Quick-pick |
| Open map with no layer panel | n/a | Layers panel collapsible on the left | Persist open/closed state |
| Per-layer row | n/a | checkbox (vis), color swatch, rename, delete, stroke slider | All inline |
| Grouping | n/a | Select 2+ layers → "Group" → name → shared color | Color cascades to members |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `.claude/PRPs/plans/phase-1-mvp-single-file-viewer.plan.md` | "Patterns this phase introduces" | Mirror WEBVIEW_MESSAGE_PROTOCOL, WEBVIEW_PANEL_LIFECYCLE |
| P0 | `packages/shared/src/messages.ts` | all | Extend the discriminated union |
| P0 | `packages/webview/src/map/mapbox-map.ts` | all | Extend with addLayer/removeLayer/updateLayer methods |
| P1 | `packages/webview/src/map/render-layer.ts` | all | Make idempotent + support stroke width |
| P1 | `packages/shared/src/colors.ts` | all | PALETTE constant |
| P1 | `packages/vscode/src/map-panel.ts` | all | Add multi-layer state tracking |

## External Documentation

| Topic | Source | Key Takeaway |
|---|---|---|
| Mapbox setPaintProperty | https://docs.mapbox.com/mapbox-gl-js/api/map/#map#setpaintproperty | Use for live color/stroke-width updates — don't tear down |
| Mapbox setLayoutProperty (visibility) | https://docs.mapbox.com/mapbox-gl-js/api/map/#map#setlayoutproperty | `'visibility'` = `'visible'` / `'none'` |
| VS Code QuickPick | https://code.visualstudio.com/api/references/vscode-api#window.showQuickPick | Used for "Add to current map" vs "Open new" |

---

## Patterns to Mirror (from Phase 0/1)

- **NAMING**, **LOGGING**, **ERROR_HANDLING** from Phase 0
- **WEBVIEW_MESSAGE_PROTOCOL** from Phase 1 — extend with new message types
- **WEBVIEW_PANEL_LIFECYCLE** from Phase 1 — `MapPanel` continues to own one webview

## New Patterns this phase introduces

### LAYER_STATE_MODEL (types in `shared`, reducer in `core`)
Pure, immutable. The host owns layer state; the webview is told what to render.

```ts
// packages/shared/src/layer.ts
import type { ColorHex } from './colors.js';

export interface Layer {
  readonly id: string;
  readonly fileName: string;
  readonly displayName: string;
  readonly sourcePath: string;
  readonly color: ColorHex;
  readonly strokeWidth: number;
  readonly visible: boolean;
  readonly groupId: string | null;
  readonly featureCount: number;
}

export interface Group {
  readonly id: string;
  readonly name: string;
  readonly color: ColorHex;
  readonly visible: boolean;
}

export interface LayerState {
  readonly layers: ReadonlyArray<Layer>;
  readonly groups: ReadonlyArray<Group>;
}

export type LayerAction =
  | { type: 'addLayer'; layer: Layer }
  | { type: 'removeLayer'; layerId: string }
  | { type: 'renameLayer'; layerId: string; name: string }
  | { type: 'setLayerColor'; layerId: string; color: ColorHex }
  | { type: 'setLayerStrokeWidth'; layerId: string; width: number }
  | { type: 'setLayerVisible'; layerId: string; visible: boolean }
  | { type: 'createGroup'; group: Group; layerIds: string[] }
  | { type: 'renameGroup'; groupId: string; name: string }
  | { type: 'setGroupColor'; groupId: string; color: ColorHex }
  | { type: 'setGroupVisible'; groupId: string; visible: boolean }
  | { type: 'deleteGroup'; groupId: string }
  | { type: 'addToGroup'; layerId: string; groupId: string }
  | { type: 'removeFromGroup'; layerId: string };

export const EMPTY_LAYER_STATE: LayerState = { layers: [], groups: [] };
```

```ts
// packages/core/src/layers/layer-state.ts — pure reducer
import type { LayerState, LayerAction } from '@maps-viewer/shared';
export function reduce(state: LayerState, action: LayerAction): LayerState { /* ~80 lines */ }
```

### COLOR_ASSIGNMENT
Deterministic cycling through positions 0–19 of `PALETTE`. Reserves indices 20 (white) + 21 (black) for user override only.

```ts
// packages/core/src/colors/assign-color.ts
import { PALETTE, type ColorHex } from '@maps-viewer/shared';
export function assignColor(usedCount: number): ColorHex {
  return PALETTE[usedCount % 20];
}
```

### LAYER_PANEL_COMPONENT (webview UI)
Plain DOM, no framework. One module per concern. State down via props; events up via callbacks that post messages.

```ts
// packages/webview/src/ui/layers-panel.ts (sketch)
export interface LayersPanelProps {
  state: LayerState;
  onAction: (a: LayerAction) => void;
}
export function mountLayersPanel(container: HTMLElement, props: LayersPanelProps): {
  update(state: LayerState): void;
  destroy(): void;
} { /* ... */ }
```

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `/packages/shared/src/messages.ts` | UPDATE | Add `applyAction` message + extend init with `LayerState` |
| `/packages/shared/src/layer.ts` | CREATE | `Layer`, `Group`, `LayerState`, `LayerAction` types |
| `/packages/shared/src/index.ts` | UPDATE | Re-export `layer.ts` |
| `/packages/core/src/layers/layer-state.ts` | CREATE | Reducer |
| `/packages/core/src/layers/__tests__/layer-state.test.ts` | CREATE | 15+ tests |
| `/packages/core/src/colors/assign-color.ts` | CREATE | Color cycler |
| `/packages/core/src/colors/__tests__/assign-color.test.ts` | CREATE | Verify cycling, skip white/black |
| `/packages/vscode/src/map-panel.ts` | UPDATE | Hold `LayerState`; route actions through reducer |
| `/packages/vscode/src/commands/view-in-maps.ts` | UPDATE | Prompt "open new" vs "add to current" if panel exists |
| `/packages/vscode/src/commands/add-file-to-map.ts` | CREATE | Imperative command |
| `/packages/webview/src/main.ts` | UPDATE | Route `applyAction` → MapboxMap; mount LayersPanel |
| `/packages/webview/src/map/mapbox-map.ts` | UPDATE | `applyAction(action, layerData?)` |
| `/packages/webview/src/map/render-layer.ts` | UPDATE | Accept `Layer` with color + strokeWidth |
| `/packages/webview/src/ui/layers-panel.ts` | CREATE | Sidebar |
| `/packages/webview/src/ui/layer-row.ts` | CREATE | Single row |
| `/packages/webview/src/ui/group-header.ts` | CREATE | Collapsible group |
| `/packages/webview/src/ui/color-picker.ts` | CREATE | 22-swatch dropdown |
| `/packages/webview/src/ui/stroke-slider.ts` | CREATE | Range input 0–50 |
| `/packages/webview/src/styles.css` | UPDATE | Sidebar layout |

## NOT Building

- Map-level persistence ("save this as a project") — Phase 3
- Drag-drop reorder of layers — Phase 5+
- Primary key, Locate, country scoping — Phase 4
- Per-layer property editing — out of scope (read-only viewer)
- Multi-select reorder via shift-click — defer to feedback

---

## Step-by-Step Tasks

### Task 1: Move layer types into `shared`
- **ACTION**: Create `packages/shared/src/layer.ts` per LAYER_STATE_MODEL
- **GOTCHA**: Keep `shared` dependency-free (no `core` import). Reducer lives in `core` and imports types from `shared`.
- **VALIDATE**: `pnpm --filter @maps-viewer/shared run build` succeeds

### Task 2: Implement reducer in `core`
- **ACTION**: Pure `reduce(state, action): LayerState`
- **IMPLEMENT**: Switch on `action.type`. Each case returns a NEW state object (never mutate). `setGroupColor` cascades to all member layers. `deleteGroup` sets `groupId = null` on members.
- **GOTCHA**: `setLayerColor` on a grouped layer does NOT update the group — the layer "breaks" from the group's shared color until manually re-grouped. Document this.
- **GOTCHA**: `addLayer` with a duplicate id is a no-op (logs warn).
- **VALIDATE**: Test suite covers all 13 actions + immutability invariants

### Task 3: Color assignment
- **ACTION**: `assignColor(usedCount): ColorHex`
- **MIRROR**: COLOR_ASSIGNMENT pattern
- **VALIDATE**: `assignColor(0..21)` returns 22 values from `PALETTE.slice(0,20)` cycling every 20; never white/black

### Task 4: Extend message protocol
- **ACTION**: Add `applyAction` host message + `requestAction` webview message
- **IMPLEMENT**:
  ```ts
  // additions to packages/shared/src/messages.ts
  import type { LayerState, LayerAction } from './layer.js';
  import type { FeatureCollection } from 'geojson';

  export type HostMessage =
    | { type: 'init'; mapboxToken: string; state: LayerState;
        layerData: Record<string, FeatureCollection>; basemap: 'standard'|'satellite' }
    | { type: 'applyAction'; action: LayerAction; layerData?: Record<string, FeatureCollection> }
    | { type: 'setBasemap'; basemap: 'standard'|'satellite' };

  // Only certain actions can originate from the webview (UI events):
  export type UserAction = Exclude<LayerAction, { type: 'addLayer' }>;

  export type WebviewMessage =
    | { type: 'ready' }
    | { type: 'mapLoaded' }
    | { type: 'requestAction'; action: UserAction }
    | { type: 'error'; message: string; code?: string };
  ```
- **GOTCHA**: GeoJSON in postMessage is JSON-cloned. For multi-megabyte files this is slow but acceptable. Only included on `addLayer`.
- **GOTCHA**: `addLayer` always originates from extension (file IO lives there). Restrict via `UserAction` type.

### Task 5: `MapPanel` becomes multi-layer-aware
- **ACTION**: Hold `LayerState` + `Map<layerId, FeatureCollection>`. Route `requestAction` from webview through `reduce()` and post `applyAction`.
- **IMPLEMENT** (sketch):
  ```ts
  // packages/vscode/src/map-panel.ts (additions)
  private layerState: LayerState = EMPTY_LAYER_STATE;
  private layerData = new Map<string, FeatureCollection>();

  async addFile(uri: vscode.Uri) {
    const fc = await readGeoJsonFile(uri);
    const id = `layer-${Date.now()}`;
    const fileName = uri.path.split('/').pop()!;
    const layer: Layer = {
      id, fileName, displayName: fileName, sourcePath: uri.toString(),
      color: assignColor(this.layerState.layers.length),
      strokeWidth: 3, visible: true, groupId: null,
      featureCount: fc.features.length,
    };
    this.layerState = reduce(this.layerState, { type: 'addLayer', layer });
    this.layerData.set(id, fc);
    void this.panel.webview.postMessage({
      type: 'applyAction', action: { type: 'addLayer', layer }, layerData: { [id]: fc },
    } satisfies HostMessage);
  }

  private onWebviewMessage = (msg: WebviewMessage) => {
    switch (msg.type) {
      case 'requestAction':
        this.layerState = reduce(this.layerState, msg.action);
        // For removeLayer, drop from layerData map too
        if (msg.action.type === 'removeLayer') this.layerData.delete(msg.action.layerId);
        // Echo back so webview can sync its mirror
        void this.panel.webview.postMessage({ type: 'applyAction', action: msg.action } satisfies HostMessage);
        break;
      // ... existing cases
    }
  };

  static activeForWindow(): MapPanel | undefined {
    // tracked via onDidChangeViewState; returns the most recently focused panel
    return MapPanel.lastFocused;
  }
  ```
- **MIRROR**: WEBVIEW_MESSAGE_PROTOCOL from Phase 1
- **GOTCHA**: Echo pattern: webview tentatively updates its UI on the user action AND waits for the host echo to confirm. If host rejects (e.g., duplicate add), webview reconciles on next echo. Keep simple in v2: extension always trusts; no rejection path.

### Task 6: `MapboxMap.applyAction`
- **ACTION**: Map each action to a Mapbox API call
- **IMPLEMENT** (sketch):
  ```ts
  applyAction(action: LayerAction, layerData?: Record<string, FeatureCollection>) {
    switch (action.type) {
      case 'addLayer': {
        const data = layerData?.[action.layer.id];
        if (!data) return;
        renderLayer(this.map, { ...action.layer, geojson: data });
        wireHover(this.map, action.layer.id);
        break;
      }
      case 'removeLayer':
        for (const suf of ['fill', 'line', 'point']) {
          const id = `${action.layerId}-${suf}`;
          if (this.map.getLayer(id)) this.map.removeLayer(id);
        }
        if (this.map.getSource(action.layerId)) this.map.removeSource(action.layerId);
        break;
      case 'setLayerColor':
        for (const suf of ['fill','line','point']) {
          const id = `${action.layerId}-${suf}`;
          if (!this.map.getLayer(id)) continue;
          this.map.setPaintProperty(id, this.paintKeyFor(suf), [
            'case', ['boolean', ['feature-state','hover'], false], '#FFFF00', action.color,
          ]);
        }
        break;
      case 'setLayerStrokeWidth':
        if (this.map.getLayer(`${action.layerId}-line`))
          this.map.setPaintProperty(`${action.layerId}-line`, 'line-width', action.width);
        if (this.map.getLayer(`${action.layerId}-point`))
          this.map.setPaintProperty(`${action.layerId}-point`, 'circle-radius', Math.max(action.width, 2));
        break;
      case 'setLayerVisible':
        for (const suf of ['fill','line','point']) {
          const id = `${action.layerId}-${suf}`;
          if (!this.map.getLayer(id)) continue;
          this.map.setLayoutProperty(id, 'visibility', action.visible ? 'visible' : 'none');
        }
        break;
      case 'setGroupVisible': /* host echoes per-member setLayerVisible */ break;
      case 'setGroupColor':   /* host cascades; no-op here */ break;
      // renameLayer / renameGroup / createGroup / deleteGroup — pure data, no Mapbox call
    }
  }
  ```
- **GOTCHA**: `setPaintProperty` on missing layer throws — always `getLayer()` check first.
- **GOTCHA**: One source backs three sublayers; remove all three sublayers before `removeSource`.

### Task 7: Layers Panel UI
- **ACTION**: Plain-DOM panel (~250 lines total across modules)
- **IMPLEMENT**: Modules per concern (see Files to Change). No framework. Update via diffing `LayerState`. Color picker shows 22 swatches in a 11×2 grid.
- **GOTCHA**: Stroke slider should emit `setLayerStrokeWidth` on `input` (live) — not just `change`. Use `requestAnimationFrame` throttle to batch rapid drags.
- **GOTCHA**: Don't include 3rd-party UI libs; CSP would need extra `style-src` allowances.

### Task 8: "Add to current map" UX
- **ACTION**: Modify `viewInMaps` to detect active panel
- **IMPLEMENT**:
  ```ts
  const activePanel = MapPanel.activeForWindow();
  if (activePanel) {
    const choice = await vscode.window.showQuickPick(
      ['Add to current map', 'Open in new map', 'Cancel'],
      { placeHolder: `A map is already open. ${fileName}?` },
    );
    if (choice === 'Cancel' || !choice) return;
    if (choice === 'Add to current map') { await activePanel.addFile(targetUri); return; }
  }
  ```
- **GOTCHA**: Track most-recently-focused panel via `panel.onDidChangeViewState`.

### Task 9: `addFileToMap` command
- **ACTION**: Surface explicit command in palette
- **IMPLEMENT**: `mapsViewer.addFileToMap` → if active panel, `vscode.window.showOpenDialog({filters:{GeoJSON:['geojson']}})` → call `panel.addFile()`.

### Task 10: Tests
- **ACTION**: Reducer test suite + color cycler tests
- **IMPLEMENT**:
  ```ts
  describe('layer-state reducer', () => {
    it('addLayer appends', ...);
    it('removeLayer drops the layer + cleans group membership', ...);
    it('setGroupColor cascades to member layers', ...);
    it('deleteGroup unparents members', ...);
    it('setLayerColor on grouped layer does NOT update group', ...);
    it('reducer never mutates input state', ...);
    it('addLayer with duplicate id is a no-op + logs warn', ...);
    it('createGroup with non-existent layerId is rejected silently', ...);
    it('addToGroup on already-in-group layer moves it', ...);
    it('removeFromGroup is no-op on ungrouped layer', ...);
    it('setLayerStrokeWidth clamps to [0, 50]', ...);
    it('setLayerVisible toggles independently of group visibility', ...);
    it('renameLayer to empty string falls back to fileName', ...);
    it('renameGroup to empty string falls back to "Untitled"', ...);
    it('setGroupVisible cascades to member visibility (or document non-cascade)', ...);
  });
  ```
- **VALIDATE**: 15+ cases, 100% branch coverage on reducer

---

## Testing Strategy

### Unit Tests (Vitest in `core`)

| Test | Input | Expected | Edge Case? |
|---|---|---|---|
| reducer: addLayer | EMPTY, addLayer(A) | layers=[A] | no |
| reducer: removeLayer | {A}, removeLayer(A) | layers=[] | no |
| reducer: setGroupColor cascades | {A,B in g1}, setGroupColor(g1,#x) | group + A + B all #x | yes |
| reducer: deleteGroup unparents | {A,B in g1}, deleteGroup(g1) | groups=[], A.groupId=null, B.groupId=null | yes |
| reducer: setLayerColor on grouped layer | {A in g1 color=#x}, setLayerColor(A,#y) | A.color=#y, g1.color unchanged | yes |
| reducer: immutability | reduce(s,a) | s !== result; deep equal of s untouched | yes |
| reducer: stroke clamp | setLayerStrokeWidth -5 / 99 | clamped to 0 / 50 | yes |
| assignColor: cycles | 0..20 | PALETTE[0..19,0] | yes |
| assignColor: never white/black | any count | never `#ffffff` or `#000000` | yes |

### Edge Cases Checklist
- [ ] Add same file twice → two layers (no dedupe in v1)
- [ ] Toggle group visibility → all members hidden (in webview reflection)
- [ ] Rename layer to "" → falls back to fileName
- [ ] Remove last layer of a group → group stays empty
- [ ] 50MB file as 2nd layer → already-rendered layers stay interactive while new one parses
- [ ] Stroke width 0 → line disappears, feature still hoverable via fill/point
- [ ] Stroke width 50 → renders without freeze

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
EXPECT: All reducer tests pass

### Build
```bash
pnpm build
```
EXPECT: All packages build

### Extension Host Smoke
```
1. F5
2. Right-click foo.geojson → "View in Maps"
3. Right-click bar.geojson → quick-pick → "Add to current map" → 2nd color appears
4. In Layers Panel:
   a. Uncheck Layer 2 → disappears
   b. Re-check → reappears
   c. Click color swatch on Layer 1 → pick #ffe119 → live update
   d. Drag stroke slider to 10 → lines thicken live
   e. Select Layer 1 + Layer 2 → "Group" → name "Boundaries" → both pick up group color
   f. Rename a layer → label updates; map color unchanged
   g. Delete Layer 2 → row gone, features gone
```

### Manual Validation
- [ ] 5 files in distinct colors
- [ ] Group color change cascades live
- [ ] Group visibility hides all members
- [ ] Rename does not redraw
- [ ] Color picker shows all 22 swatches; selection persists
- [ ] Stroke 0–50; default 3

---

## Acceptance Criteria
- [ ] Multiple files in a single map
- [ ] Each layer/group has color from 20-palette; white/black available manually
- [ ] Per-layer view/hide, rename, delete
- [ ] Per-group view/hide, rename, delete
- [ ] Stroke slider 0–50 (default 3)
- [ ] Layer state lives in `core/layers/layer-state.ts` and is reducer-pure
- [ ] All Mapbox updates use `setPaintProperty`/`setLayoutProperty`

## Completion Checklist
- [ ] LayerState reducer 100% covered
- [ ] No mutation in webview (mirror immutable host state)
- [ ] Color picker uses `PALETTE` constant — no inline hex
- [ ] No `console.log`
- [ ] Message protocol extension is backwards-compatible

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Reducer grows large and bug-prone | Medium | Medium | One test per action + 5 invariants; pure |
| postMessage payloads slow for big GeoJSON | Medium | Medium | GeoJSON content only on `addLayer` |
| Layer ordering ambiguity | Medium | Low | `layers` array order = render order; new on top |
| 20+ layers feels sluggish | Low | Low | Defer virtualization until measured perf justifies |
| Group color cascade vs per-layer override confusion | Medium | Low | Document: per-layer overrides until regrouped |

## Notes

- Layer types live in `shared` (Option B from research); only the reducer lives in `core`. Keeps `shared` dep-free.
- Group color cascade is one-way (group → members). Manual per-layer override breaks the cascade for that layer.
- We do NOT add drag-drop reorder, multi-select, or layer copy in Phase 2.
- "Add to current map" via right-click quick-pick is the friendly path; `addFileToMap` palette command is the explicit path.
