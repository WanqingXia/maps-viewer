# Maps Viewer

> A VS Code extension that visualizes one or many GeoJSON files on an interactive Mapbox map — without ever leaving your IDE.

Right-click any `.geojson` file → **View in Maps** → see it on a real map with hover popups, color-coded layers, group cascades, country scoping, primary-key Locate, and saved Map Projects.

![Maps Viewer hero](docs/screenshots/hero.png)

> **Status**: v0.1.0 (alpha — first public release candidate). Built across 5 phases from spec to ship; see `.claude/PRPs/` for the full PRD, plans, and per-phase implementation reports.

---

## Features

- **Right-click GeoJSON → View in Maps** — instant in-IDE map, no upload to external tools
- **Multi-file comparison** — load several files into one map, group them, share colors
- **22-color palette** — auto-cycles per layer; pick any swatch with one click
- **Hover-to-highlight + properties popup** — every feature reveals its full attribute set
- **Standard / Satellite basemap toggle** — top-right of the map
- **Maps Manager sidebar** — save your current map as a named project; reopen it later with identical layers + camera
- **Locate by primary key** — set a PK column once, then Cmd+Shift+P → type any value → fly to the feature
- **Country scoping** — pick from 47 curated countries to limit the view
- **Small-feature-as-dot** — sub-100m features render as 4px circles at low zoom so nothing disappears
- **Adjustable stroke width** — 0–50 per layer, live preview as you drag
- **BYO Mapbox token** — your token stays on your machine via VS Code's SecretStorage; never shared

## Quickstart

```
1. Install the extension
2. Open a folder containing one or more `.geojson` files
3. Right-click a .geojson → "View in Maps"
4. First time only: paste a Mapbox public token (pk.…)
   Get one free at https://account.mapbox.com/access-tokens/
5. The map opens in a panel beside the editor
```

See [docs/quickstart.md](docs/quickstart.md) for the full walkthrough including multi-file load, grouping, and saving projects.

## Maps Manager

Click the **Maps Manager** icon in the activity bar to see Recent + All Projects.

- **Save as Project…** captures: file paths + layer state (colors, stroke, visibility, names, groups) + current camera + basemap + country + primary-key map.
- **Open** any project to restore the exact view.
- **Inline actions** on hover: Open · Rename · Delete.
- **Missing files** prompt a per-file "Locate…" picker — relocate and the project is updated for next time.

By default, projects are stored in VS Code's per-extension global storage. Set `mapsViewer.mapsLocation` to a path in iCloud / Dropbox to sync across machines.

## Discovery commands (palette)

| Command | What it does |
|---|---|
| `Maps Viewer: View in Maps` | Open a `.geojson` (right-click is the usual entry) |
| `Maps Viewer: Add File to Current Map…` | Append more layers to the active panel |
| `Maps Viewer: Set Primary Key…` | Pick a layer + a property to use as the layer's record id |
| `Maps Viewer: Locate Feature…` | Flat quick-pick of every PK value; jumps + pulses the feature |
| `Maps Viewer: Set Country Scope…` | Country quick-pick; map auto-fits |
| `Maps Viewer: Save as Project…` | Persist the current map as a named project |
| `Maps Viewer: Set Mapbox Token…` | Re-enter / rotate your Mapbox token |

## Settings

| Setting | Default | Purpose |
|---|---|---|
| `mapsViewer.defaultBasemap` | `standard` | Basemap shown when a map first opens. `standard` or `satellite`. |
| `mapsViewer.mapsLocation` | (empty) | Absolute path to a custom `maps.json`. Use to point at iCloud / Dropbox for cross-machine sync. Empty = VS Code global storage. |

## Privacy

Maps Viewer **does not collect telemetry**. Your Mapbox token is stored locally via VS Code's `SecretStorage` and never sent anywhere except `*.mapbox.com` for tile and style requests. Your GeoJSON files never leave your machine. See [docs/privacy.md](docs/privacy.md) for the full statement.

## Known limitations

- **50 MB hard cap** on a single `.geojson` file (read into memory; large datasets show a parse error)
- **Concurrent edits** to `maps.json` from multiple VS Code windows are last-writer-wins
- **No grouping UI yet** in the sidebar — the data model supports groups (Phase 2) but a "Group selected layers" button is on the polish list
- **47 curated country bboxes** — easy to add more via a PR to `packages/core/src/bbox/country-bboxes.json`
- **Dev mode F5** vs **VSIX install** — they're identical at runtime; sibling-package URIs are bundled into the VSIX's `dist/webview/` at build time
- **macOS users**: VS Code's F5 may collide with macOS Dictation. Use `Cmd+Shift+P → Debug: Start Debugging` instead

## Dev setup (for contributing)

```bash
git clone https://github.com/PLACEHOLDER/maps-viewer.git
cd maps-viewer
pnpm install
pnpm build
# F5 in VS Code (or Cmd+Shift+P → "Debug: Start Debugging")
# A second VS Code window launches with the extension installed
```

Tests:

```bash
pnpm test          # 73 tests across 11 files
pnpm typecheck     # 4 packages, strict
```

Package + install locally:

```bash
pnpm build
pnpm --filter maps-viewer run package
code --install-extension packages/vscode/maps-viewer-0.1.0.vsix --force
```

See `.claude/PRPs/` for:
- `prds/maps-viewer.prd.md` — the source-of-truth product spec
- `plans/completed/*.plan.md` — per-phase implementation plans
- `reports/*.md` — what was actually built per phase

## License

MIT — see [LICENSE](./LICENSE).
