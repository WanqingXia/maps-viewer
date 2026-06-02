# Plan: Phase 3 — Maps Manager + Persistence

## Summary

Introduce a persistent, named "Map Project" concept and surface it through a Maps Manager activity-bar sidebar (modeled on the 7.27M-install Project Manager extension). Users save the current map's file paths + layer settings + camera state as a project, list saved projects in a tree view, and re-open any project with identical state restored across VS Code sessions. Storage is a single schema-versioned `maps.json` in extension global storage, with a `mapsLocation` setting for portability via iCloud/Dropbox.

**Can run in parallel with Phase 4** — different surfaces; only the project schema is shared, and it's fixed in this phase.

## User Story

As a **GIS engineer who returns to the same map setups repeatedly**, I want to **save a configured map as a named project and re-open it later with one click**, so that **I never re-add files, re-color layers, or re-set the camera by hand again**.

## Problem → Solution

After Phase 2, every map setup is ephemeral — close the panel and all configuration is lost. Phase 3 introduces persistence: file paths, layer state (colors, stroke widths, visibility, grouping, names), basemap choice, and camera (center + zoom + bearing + pitch) are saved as a project. A dedicated activity-bar sidebar lists projects with inline Open / Rename / Delete actions.

## Metadata

- **Complexity**: Large
- **Source PRD**: `.claude/PRPs/prds/maps-viewer.prd.md`
- **PRD Phase**: Phase 3 — Maps Manager + persistence (parallel with Phase 4)
- **Estimated Files**: ~16

## Data Structure (synthetic example for review)

This phase produces `maps.json`. Example shape (synthetic values, redacted paths):

```jsonc
{
  "version": 1,
  "projects": [
    {
      "id": "01HM-EXAMPLE-PROJECT-UUID-XXXX",
      "name": "NZ regions audit",
      "createdAt": "2026-05-29T14:55:00.000Z",
      "updatedAt": "2026-05-30T09:12:33.000Z",
      "files": [
        { "layerId": "layer-1", "path": "data/regions.geojson", "pathKind": "workspaceRelative", "workspaceFolder": "maps-viewer" },
        { "layerId": "layer-2", "path": "/Users/REDACTED/Downloads/districts.geojson", "pathKind": "absolute" }
      ],
      "layerState": {
        "layers": [
          { "id": "layer-1", "fileName": "regions.geojson", "displayName": "Regions", "sourcePath": "file:///REDACTED",
            "color": "#e6194b", "strokeWidth": 3, "visible": true, "groupId": "group-1", "featureCount": 16 }
        ],
        "groups": [
          { "id": "group-1", "name": "Boundaries", "color": "#e6194b", "visible": true }
        ]
      },
      "basemap": "standard",
      "camera": { "center": [174.7633, -36.8485], "zoom": 5.3, "bearing": 0, "pitch": 0 },
      "country": "NZ",
      "primaryKeyByLayer": { "layer-1": "REGION_CODE" },
      "tags": []
    }
  ]
}
```

Date format: **ISO 8601 in UTC** (with `.000Z` precision). Color: `#RRGGBB` lowercase. Camera coords: `[lng, lat]` (Mapbox order).

---

## UX Design

### Before (Phase 2)
```
┌──────────────────────────────────────────────────┐
│ Maps Viewer panel (transient)                    │
│  Close → all layer setup forgotten               │
└──────────────────────────────────────────────────┘
```

### After
```
Activity Bar:                                      Side Panel:
┌──┐                                ┌───────────────────────────────────────┐
│..│  ← existing icons              │  MAPS MANAGER          [+ New Project]│
│📁│  ← Explorer                    │ ───────────────────────────────────── │
│🔍│  ← Search                       │  ▸ Recent                              │
│🗺️│  ← Maps Manager (new)          │     NZ regions       [open][✏️][🗑]    │
└──┘                                │     SF logistics     [open][✏️][🗑]    │
                                    │  ▸ All Projects                        │
                                    │     ...                                 │
                                    └───────────────────────────────────────┘
```

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| Activity bar | n/a | "Maps Manager" icon | Custom SVG |
| Open saved project | n/a | One click in tree view | Restores files + layers + camera |
| Save current map | n/a | Toolbar "+" or palette | Prompts for name |
| Missing file on open | n/a | "Missing" badge + Repath… action | File picker to relocate |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `.claude/PRPs/plans/phase-2-multi-file-layers-styling.plan.md` | "LAYER_STATE_MODEL" | Project state embeds LayerState |
| P0 | `packages/shared/src/layer.ts` | all | Re-used as nested type |
| P0 | `packages/vscode/src/map-panel.ts` | all | Will gain `getProjectSnapshot()` and `openFromProject()` |
| P1 | `.claude/PRPs/prds/maps-viewer.prd.md` | Decisions Log → Project storage | Justifies global-storage + `mapsLocation` |
| P2 | https://github.com/microsoft/vscode-extension-samples/tree/main/tree-view-sample | sample | Standard TreeDataProvider pattern |

## External Documentation

| Topic | Source | Key Takeaway |
|---|---|---|
| TreeDataProvider | https://code.visualstudio.com/api/extension-guides/tree-view | `getChildren` + `getTreeItem`; fire `_onDidChangeTreeData` to refresh |
| viewsContainers | https://code.visualstudio.com/api/references/contribution-points#contributes.viewsContainers | Activity bar contribution + SVG icon |
| view/item/context (inline) | https://code.visualstudio.com/api/references/contribution-points#contributes.menus | `group: 'inline'` → hover icons |
| globalStorageUri | https://code.visualstudio.com/api/references/vscode-api#ExtensionContext | Per-extension global path |
| Zod | https://zod.dev | Runtime schema validation for `maps.json` |

---

## Patterns to Mirror

- All patterns from Phases 0–2
- **LAYER_STATE_MODEL** from Phase 2 — the project snapshot embeds it

## New patterns this phase introduces

### PROJECT_SCHEMA (versioned, Zod-validated)

```ts
// packages/shared/src/project.ts
import type { LayerState } from './layer.js';

export interface ProjectCameraState {
  readonly center: readonly [number, number];
  readonly zoom: number;
  readonly bearing: number;
  readonly pitch: number;
}

export interface ProjectFileRef {
  readonly layerId: string;
  readonly path: string;
  readonly pathKind: 'absolute' | 'workspaceRelative';
  readonly workspaceFolder?: string;
}

export interface Project {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly files: ReadonlyArray<ProjectFileRef>;
  readonly layerState: LayerState;
  readonly basemap: 'standard' | 'satellite';
  readonly camera: ProjectCameraState;
  readonly country?: string;
  readonly primaryKeyByLayer?: Record<string, string>;
  readonly tags?: ReadonlyArray<string>;
}

export interface MapsJsonV1 {
  readonly version: 1;
  readonly projects: ReadonlyArray<Project>;
}

export type MapsJson = MapsJsonV1;
```

### MAPS_STORE (single source of truth)

```ts
// packages/vscode/src/manager/maps-store.ts
import * as vscode from 'vscode';
import type { MapsJson, Project } from '@maps-viewer/shared';
import { parseMapsJson, EMPTY_MAPS_JSON } from '@maps-viewer/core';

export class MapsStore {
  private cache: MapsJson = EMPTY_MAPS_JSON;
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private fileUri: vscode.Uri) {}

  static async create(ctx: vscode.ExtensionContext): Promise<MapsStore> {
    const configured = vscode.workspace.getConfiguration('mapsViewer').get<string>('mapsLocation');
    const uri = configured && configured.trim()
      ? vscode.Uri.file(configured)
      : vscode.Uri.joinPath(ctx.globalStorageUri, 'maps.json');
    const store = new MapsStore(uri);
    await store.load();
    return store;
  }

  async load(): Promise<void> {
    try {
      const bytes = await vscode.workspace.fs.readFile(this.fileUri);
      this.cache = parseMapsJson(new TextDecoder().decode(bytes));
    } catch { this.cache = EMPTY_MAPS_JSON; }
  }
  list(): ReadonlyArray<Project> { return this.cache.projects; }
  get(id: string): Project | undefined { return this.cache.projects.find(p => p.id === id); }

  async upsert(p: Project): Promise<void> {
    const exists = this.cache.projects.some(x => x.id === p.id);
    const next: MapsJson = {
      version: 1,
      projects: exists
        ? this.cache.projects.map(x => x.id === p.id ? p : x)
        : [...this.cache.projects, p],
    };
    await this.write(next);
  }
  async delete(id: string): Promise<void> {
    const next: MapsJson = { version: 1, projects: this.cache.projects.filter(x => x.id !== id) };
    await this.write(next);
  }

  private async write(next: MapsJson): Promise<void> {
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(this.fileUri, '..'));
    await vscode.workspace.fs.writeFile(this.fileUri, new TextEncoder().encode(JSON.stringify(next, null, 2)));
    this.cache = next;
    this._onDidChange.fire();
  }
}
```

### TREE_DATA_PROVIDER

```ts
// packages/vscode/src/manager/maps-tree-data-provider.ts
type TreeNode =
  | { kind: 'recent-section' }
  | { kind: 'all-section' }
  | { kind: 'project'; project: Project; section: 'recent' | 'all' };

export class MapsTreeDataProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  constructor(private store: MapsStore) { store.onDidChange(() => this._onDidChangeTreeData.fire()); }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    if (node.kind === 'recent-section') {
      const item = new vscode.TreeItem('Recent', vscode.TreeItemCollapsibleState.Expanded);
      item.contextValue = 'section'; return item;
    }
    if (node.kind === 'all-section') {
      const item = new vscode.TreeItem('All Projects', vscode.TreeItemCollapsibleState.Expanded);
      item.contextValue = 'section'; return item;
    }
    const item = new vscode.TreeItem(node.project.name, vscode.TreeItemCollapsibleState.None);
    item.contextValue = 'project';
    item.id = `${node.section}:${node.project.id}`;
    item.tooltip = `${node.project.files.length} file(s) • updated ${node.project.updatedAt}`;
    item.command = { command: 'mapsViewer.openProject', title: 'Open', arguments: [node.project.id] };
    return item;
  }
  async getChildren(node?: TreeNode): Promise<TreeNode[]> {
    if (!node) return [{ kind: 'recent-section' }, { kind: 'all-section' }];
    const projects = this.store.list();
    if (node.kind === 'recent-section') {
      return [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5)
        .map(p => ({ kind: 'project', project: p, section: 'recent' as const }));
    }
    if (node.kind === 'all-section') {
      return [...projects].sort((a, b) => a.name.localeCompare(b.name))
        .map(p => ({ kind: 'project', project: p, section: 'all' as const }));
    }
    return [];
  }
}
```

### REPATH_FLOW
When opening a project whose file paths no longer resolve, prompt per missing file: "Locate `foo.geojson`?" → file picker → update path in project, upsert.

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `/packages/shared/src/project.ts` | CREATE | `Project`, `MapsJson`, `ProjectCameraState`, `ProjectFileRef` |
| `/packages/shared/src/index.ts` | UPDATE | Re-export project types |
| `/packages/shared/src/messages.ts` | UPDATE | `getCameraState` request + reply, `setCamera` host msg |
| `/packages/core/src/storage/project-schema.ts` | CREATE | Zod + `parseMapsJson` + `EMPTY_MAPS_JSON` |
| `/packages/core/src/storage/__tests__/project-schema.test.ts` | CREATE | Schema validation tests |
| `/packages/core/src/storage/path-resolver.ts` | CREATE | absolute ↔ workspace-relative helpers |
| `/packages/core/src/storage/__tests__/path-resolver.test.ts` | CREATE | Path tests |
| `/packages/vscode/src/manager/maps-store.ts` | CREATE | `MapsStore` |
| `/packages/vscode/src/manager/maps-tree-data-provider.ts` | CREATE | Tree view |
| `/packages/vscode/src/manager/commands/save-project.ts` | CREATE | Snapshot → upsert |
| `/packages/vscode/src/manager/commands/open-project.ts` | CREATE | Restore project state |
| `/packages/vscode/src/manager/commands/rename-project.ts` | CREATE | Input box → upsert |
| `/packages/vscode/src/manager/commands/delete-project.ts` | CREATE | Confirm → delete |
| `/packages/vscode/src/manager/repath-missing.ts` | CREATE | Per-file picker |
| `/packages/vscode/src/map-panel.ts` | UPDATE | `getProjectSnapshot`, `openFromProject`, camera RPC |
| `/packages/vscode/src/extension.ts` | UPDATE | Wire store + tree + commands |
| `/packages/vscode/package.json` | UPDATE | Activity bar viewContainer + view + commands + menus + config |
| `/packages/vscode/resources/maps-manager.svg` | CREATE | Single-color 24×24 icon using `currentColor` |
| `/packages/webview/src/main.ts` | UPDATE | Camera RPC handler |
| `/packages/webview/src/map/mapbox-map.ts` | UPDATE | `getCameraState()`, `setCamera(state)` |

## NOT Building

- Tags / favorites — defer (PRD "Could")
- Drag-drop reorder of projects — defer
- Per-workspace project scoping — global only
- Cloud sync — out of scope per PRD
- Project import/export — defer

---

## Step-by-Step Tasks

### Task 1: Define `Project` types in `shared`
- **ACTION**: Create `packages/shared/src/project.ts` per PROJECT_SCHEMA
- **GOTCHA**: ISO 8601 UTC strings (e.g. `"2026-05-29T14:55:00.000Z"`). All fields readonly.

### Task 2: Zod schema in `core`
- **ACTION**: Validate `maps.json` on read; reject malformed instead of crashing
- **IMPLEMENT**:
  ```ts
  // packages/core/src/storage/project-schema.ts
  import { z } from 'zod';
  import type { MapsJson } from '@maps-viewer/shared';

  const Color = z.custom<`#${string}`>(v => typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v));
  const Camera = z.object({ center: z.tuple([z.number(), z.number()]), zoom: z.number(), bearing: z.number(), pitch: z.number() });
  const FileRef = z.object({ layerId: z.string(), path: z.string(), pathKind: z.enum(['absolute','workspaceRelative']), workspaceFolder: z.string().optional() });
  const Layer = z.object({ id: z.string(), fileName: z.string(), displayName: z.string(), sourcePath: z.string(),
    color: Color, strokeWidth: z.number().min(0).max(50), visible: z.boolean(),
    groupId: z.string().nullable(), featureCount: z.number().int().nonneg() });
  const Group = z.object({ id: z.string(), name: z.string(), color: Color, visible: z.boolean() });
  const LayerState = z.object({ layers: z.array(Layer), groups: z.array(Group) });
  const Project = z.object({
    id: z.string(), name: z.string(),
    createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
    files: z.array(FileRef), layerState: LayerState,
    basemap: z.enum(['standard','satellite']), camera: Camera,
    country: z.string().length(2).optional(),
    primaryKeyByLayer: z.record(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  });
  const MapsJsonZ = z.object({ version: z.literal(1), projects: z.array(Project) });

  export const EMPTY_MAPS_JSON: MapsJson = { version: 1, projects: [] };
  export function parseMapsJson(raw: string): MapsJson {
    return MapsJsonZ.parse(JSON.parse(raw)) as MapsJson;
  }
  ```
- **GOTCHA**: Add `zod` to `@maps-viewer/core` deps (~10KB ESM). Worth it for user-mutable file validation.

### Task 3: `MapsStore`
- **ACTION**: Per MAPS_STORE pattern
- **GOTCHA**: `globalStorageUri` directory may not exist on first run — `createDirectory()` before write.
- **GOTCHA**: Reading nonexistent file throws `FileSystemError(FileNotFound)` — catch → `EMPTY_MAPS_JSON`.
- **GOTCHA**: Concurrent writes from multiple windows are NOT handled in v1. Document.

### Task 4: `TreeDataProvider`
- **ACTION**: Per TREE_DATA_PROVIDER pattern. Two sections (Recent top-5 by `updatedAt`, All alpha).
- **GOTCHA**: `TreeItem.id` is REQUIRED for VS Code selection tracking; combine section + project id.

### Task 5: `package.json` contributions
- **ACTION**: Wire activity bar + views + commands + menus + config
- **IMPLEMENT** (excerpt):
  ```jsonc
  "contributes": {
    "viewsContainers": {
      "activitybar": [{ "id": "mapsViewerContainer", "title": "Maps Manager", "icon": "resources/maps-manager.svg" }]
    },
    "views": {
      "mapsViewerContainer": [{ "id": "mapsViewer.tree", "name": "Maps Manager", "icon": "resources/maps-manager.svg" }]
    },
    "commands": [
      { "command": "mapsViewer.openProject",   "title": "Open Map Project",   "icon": "$(open-preview)" },
      { "command": "mapsViewer.saveProject",   "title": "Save as Project…",   "icon": "$(save)" },
      { "command": "mapsViewer.newProject",    "title": "New Project",        "icon": "$(add)" },
      { "command": "mapsViewer.renameProject", "title": "Rename Project…",    "icon": "$(edit)" },
      { "command": "mapsViewer.deleteProject", "title": "Delete Project",     "icon": "$(trash)" },
      { "command": "mapsViewer.refreshMapsTree","title": "Refresh",           "icon": "$(refresh)" }
    ],
    "menus": {
      "view/title": [
        { "command": "mapsViewer.newProject", "when": "view == mapsViewer.tree", "group": "navigation@1" },
        { "command": "mapsViewer.refreshMapsTree", "when": "view == mapsViewer.tree", "group": "navigation@2" }
      ],
      "view/item/context": [
        { "command": "mapsViewer.openProject",   "when": "view == mapsViewer.tree && viewItem == project", "group": "inline@1" },
        { "command": "mapsViewer.renameProject", "when": "view == mapsViewer.tree && viewItem == project", "group": "inline@2" },
        { "command": "mapsViewer.deleteProject", "when": "view == mapsViewer.tree && viewItem == project", "group": "inline@3" }
      ]
    },
    "configuration": {
      "title": "Maps Viewer",
      "properties": {
        "mapsViewer.mapsLocation": {
          "type": "string", "default": "",
          "description": "Custom path to maps.json for sync via iCloud/Dropbox. Leave empty for default global storage."
        }
      }
    }
  }
  ```
- **GOTCHA**: 3 inline icons is upper limit; overflow → `...` context menu.

### Task 6: `saveProject` command
- **ACTION**: Snapshot current MapPanel → `Project` → upsert
- **IMPLEMENT**:
  ```ts
  export async function saveProject(ctx: { store: MapsStore }) {
    const panel = MapPanel.activeForWindow();
    if (!panel) { void vscode.window.showWarningMessage('No active map to save.'); return; }
    const name = await vscode.window.showInputBox({ prompt: 'Project name', placeHolder: 'NZ regions audit' });
    if (!name) return;
    const snapshot = await panel.getProjectSnapshot();
    const now = new Date().toISOString();
    const project: Project = { id: crypto.randomUUID(), name, createdAt: now, updatedAt: now, ...snapshot };
    await ctx.store.upsert(project);
    void vscode.window.showInformationMessage(`Saved "${name}".`);
  }
  ```
- **GOTCHA**: `getProjectSnapshot()` round-trips through webview for camera. Use `crypto.randomUUID()` (Node 20+).

### Task 7: `openProject` command
- **ACTION**: Load → resolve files → open MapPanel restored
- **IMPLEMENT**:
  ```ts
  export async function openProject(ctx, projectId: string) {
    const project = ctx.store.get(projectId);
    if (!project) { void vscode.window.showErrorMessage('Project not found.'); return; }
    const resolved = await Promise.all(project.files.map(async f => {
      const uri = resolvePath(f);
      try { await vscode.workspace.fs.stat(uri); return { ref: f, uri, missing: false as const }; }
      catch { return { ref: f, uri, missing: true as const }; }
    }));
    const missing = resolved.filter(r => r.missing);
    let updated = project;
    if (missing.length) {
      const repathed = await repathMissingFiles(missing);
      if (repathed.changed) {
        updated = { ...project, files: repathed.files, updatedAt: new Date().toISOString() };
        await ctx.store.upsert(updated);
      }
    }
    const layerData = new Map<string, FeatureCollection>();
    for (const r of resolved) {
      if (r.missing) continue;
      layerData.set(r.ref.layerId, await readGeoJsonFile(r.uri));
    }
    await MapPanel.openFromProject({ project: updated, layerData, ctx });
  }
  ```
- **GOTCHA**: For 10+ files use `Promise.all` with a progress notification.

### Task 8: Repath flow
- **ACTION**: For each missing file, modal: "Locate `foo.geojson`?" → file picker → return new path
- **VALIDATE**: Save project → rename file on disk → reopen → repath → reopen → no prompt second time.

### Task 9: `renameProject` + `deleteProject`
- **ACTION**: Rename via input box (default = current name); delete via modal confirmation
- **GOTCHA**: Rename preserves `id`, updates `updatedAt`.

### Task 10: Update `MapPanel`
- **ACTION**: Add `getProjectSnapshot()`, `openFromProject(args)`, plus camera RPC
- **IMPLEMENT**:
  ```ts
  async getProjectSnapshot(): Promise<Omit<Project,'id'|'name'|'createdAt'|'updatedAt'>> {
    const camera = await this.requestCamera();
    return { files: this.buildFileRefs(), layerState: this.layerState, basemap: this.basemap, camera };
  }
  static async openFromProject(args: { project: Project; layerData: Map<string, FeatureCollection>; ctx: Ctx }) {
    // Reuse panel keyed on project.id; post 'init' with full state + camera (applied on mapLoaded).
  }
  ```

### Task 11: Webview camera support
- **ACTION**: `getCameraState()` + `setCamera(state)` in `MapboxMap`; handle camera RPC in `main.ts`
- **IMPLEMENT**:
  ```ts
  getCameraState(): ProjectCameraState {
    return { center: this.map.getCenter().toArray() as [number, number],
             zoom: this.map.getZoom(), bearing: this.map.getBearing(), pitch: this.map.getPitch() };
  }
  setCamera(s: ProjectCameraState) { this.map.jumpTo({ center: s.center, zoom: s.zoom, bearing: s.bearing, pitch: s.pitch }); }
  ```
- **GOTCHA**: Call `setCamera` AFTER style/load + layers added — otherwise initial `fitBounds` from Phase 1 stomps on it.

### Task 12: Make path refs portable
- **ACTION**: `path-resolver.ts` — Uri ↔ ProjectFileRef
- **GOTCHA**: Workspace-relative refs locate folder by basename; if not found, fall back to absolute then prompt repath.

---

## Testing Strategy

### Unit Tests (Vitest in `core`)

| Test | Input | Expected | Edge Case? |
|---|---|---|---|
| `parseMapsJson` happy path | minimal valid v1 doc | parsed `MapsJson` | no |
| `parseMapsJson` missing version | `{projects:[]}` | throws ZodError | yes |
| `parseMapsJson` bad color | layer color `'red'` | throws | yes |
| `parseMapsJson` bad camera tuple | `center: [1,2,3]` | throws | yes |
| `parseMapsJson` v2 doc | `{version:2,...}` | throws (future migration) | yes |
| path-resolver: absolute round-trip | abs path | identical | no |
| path-resolver: workspace-relative | path inside workspace | relative ref produced | yes |
| path-resolver: outside workspace | path outside | absolute fallback | yes |

### Edge Cases Checklist
- [ ] Save with 0 files → valid project, opens empty map
- [ ] Save → close window → reopen → still listed
- [ ] Open with all files moved → repath prompts; cancel = layers with `missing` badge
- [ ] Open same project twice → existing panel revealed (key on project.id)
- [ ] Two windows save concurrently → last writer wins (documented)
- [ ] `mapsLocation` → iCloud path → reads/writes work
- [ ] Delete → tree refreshes; panel stays open until user closes
- [ ] Rename to "" → input box rejects
- [ ] Future-version doc → throws; user shown migration prompt (Phase 5+)

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
EXPECT: All schema + path-resolver tests pass

### Build
```bash
pnpm build
```
EXPECT: All packages build

### Extension Host Smoke
```
1. F5
2. Click Maps Manager activity-bar icon → empty tree
3. Open a .geojson via "View in Maps"; add 2nd (Phase 2)
4. View title "+" → "New Project" → name "Smoke Test" → appears in Recent + All
5. Close panel
6. Click "Smoke Test" → panel reopens with same layers + colors + camera
7. Hover → inline icons appear
8. Click ✏️ → rename → tree updates
9. Click 🗑 → confirm → row removed
10. Move source file on disk → reopen → repath prompt → relocate
```

### Manual Validation
- [ ] Activity bar shows Maps Manager icon
- [ ] Save preserves all layer settings (color, stroke, visibility, group)
- [ ] Camera position restored exactly
- [ ] `maps.json` written under `globalStorageUri` (or `mapsLocation`); valid JSON; passes schema
- [ ] No corruption when saving > 10 projects

---

## Acceptance Criteria
- [ ] Activity bar contribution + tree view
- [ ] Recent + All sections
- [ ] Save snapshots files + layer state + basemap + camera → upsert
- [ ] Open restores identical state
- [ ] Rename, Delete inline actions work
- [ ] `maps.json` schema-versioned + Zod-validated
- [ ] Missing files prompt repath; project updated
- [ ] `mapsLocation` setting honored

## Completion Checklist
- [ ] No direct `globalStorageUri` access outside MapsStore
- [ ] All reads go through `parseMapsJson`
- [ ] No `Project` mutation in place
- [ ] Tree updates via `_onDidChangeTreeData`
- [ ] No `console.log`

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Schema drift requires migration | Low | High | Versioned schema; throw clearly on unknown version |
| Concurrent writes from multiple windows | Medium | Medium | Last-writer-wins; document; add file-watcher refresh in Phase 5 |
| Path portability across machines | High | Medium | Workspace-relative when possible; repath flow |
| `maps.json` corrupted by hand-edit | Low | Medium | Zod → friendly error; add "Open maps.json" command later |
| Tree refresh storms during edits | Low | Low | Single EventEmitter; debounce not needed at expected scale |
| Activity-bar icon broken on theme change | Low | Low | Single-color SVG using `currentColor` |

## Notes

- `crypto.randomUUID()` is available in Node 20+, the extension-host baseline.
- "Recent" sorts by `updatedAt`; Phase 5 may add an `openedAt` field for true recency.
- `mapsLocation` is a *file path* (user supplies filename), not a directory.
- Phase 4 populates `country` and `primaryKeyByLayer` on the same schema — no schema changes required.
- Icon should be single-color SVG using `currentColor` so VS Code theme tinting works.
