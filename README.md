# Maps Viewer

A VS Code extension that visualizes GeoJSON files on an interactive Mapbox map — directly in your IDE. Right-click a `.geojson` file → "View in Maps" and inspect it without leaving VS Code.

> **Status**: alpha — Phase 0 scaffold. Not yet usable. See `.claude/PRPs/prds/maps-viewer.prd.md` for the roadmap and `.claude/PRPs/plans/` for per-phase implementation plans.

## Features (target)

- Right-click `.geojson` → view on Mapbox in a VS Code webview
- Multi-file layers with shared color groups
- Adjustable stroke width, hover-to-highlight, properties popup
- Standard / Satellite basemap toggle
- Saved "Map Projects" via a Maps Manager sidebar
- Primary-key Locate, country-scope bbox, small-feature-as-dot rendering

## Dev setup

Requires Node 20+ and pnpm 9+.

```bash
pnpm install
pnpm build
```

Then in VS Code: press **F5** to launch an Extension Development Host. Run the command "Maps Viewer: About" from the command palette.

## Workspace layout

```
maps-viewer/
├── packages/
│   ├── shared/   # cross-package TS types & error classes (no deps)
│   ├── core/     # engine-agnostic logic (no vscode dep) + unit tests
│   ├── webview/  # the in-iframe map UI bundle (Vite)
│   └── vscode/   # the VS Code extension host (esbuild → CJS)
├── tsconfig.base.json
├── pnpm-workspace.yaml
└── package.json
```

## Scripts

| Command | What it does |
|---|---|
| `pnpm install` | Install all workspace dependencies |
| `pnpm build` | Build all packages in dependency order |
| `pnpm watch` | Rebuild on change (run in background; F5 uses this) |
| `pnpm test` | Run unit tests (Vitest, in `@maps-viewer/core`) |
| `pnpm typecheck` | Strict typecheck across all packages |
| `pnpm clean` | Remove `dist/` + `out/` from all packages |

## Architecture

- **`shared`**: pure TypeScript types and error classes. No external runtime deps. Imported by every other package.
- **`core`**: engine-agnostic logic (color assignment, layer state reducer, project schema validation). Vitest-tested. No `vscode` dependency, so it can also run in Node, the browser, or a future Zed adapter.
- **`webview`**: the map UI bundle. Mounted inside a VS Code webview iframe. Mapbox GL JS via the CSP-strict bundle. Built with Vite to an IIFE artifact.
- **`vscode`**: the extension host. Registers commands, hosts the webview panel, manages secret storage for the Mapbox token, provides the Maps Manager sidebar tree view. Built with esbuild to a single CJS bundle.

## License

MIT — see [LICENSE](./LICENSE).
