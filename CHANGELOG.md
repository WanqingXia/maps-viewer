# Changelog

All notable changes to this project are documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This
project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.4] — Unreleased

First public-release candidate. Built across 5 phases.

### Added

#### Core viewing (Phase 1 — MVP)
- Right-click `.geojson` in the explorer → **View in Maps**
- Webview panel beside the editor, powered by Mapbox GL JS (CSP-strict UMD bundle)
- Standard / Satellite basemap toggle (top-right)
- Hover-to-highlight (`#FFFF00`) + properties popup per feature
- BYO Mapbox token first-run flow stored in VS Code `SecretStorage`

#### Multi-file layers (Phase 2)
- Multiple GeoJSON files in a single map panel
- 22-color palette (20 auto-assigned + white + black manual override)
- LayersPanel sidebar with per-layer view/hide, rename, delete
- Color picker dropdown (22 swatches)
- Stroke width slider 0–30 with live preview
- Layer grouping UI and data model (createGroup / setGroupColor cascade / deleteGroup)
- Quick-pick when adding a 2nd file: "Add to current map" vs "Open in new map"
- `Maps Viewer: Add File to Current Map…` palette command

#### Maps Manager + persistence (Phase 3)
- Activity-bar **Maps Manager** sidebar with Recent + All Projects sections
- Save / Open / Rename / Delete named map projects
- Schema-versioned, Zod-validated `maps.json`
- `mapsViewer.mapsLocation` setting for iCloud/Dropbox sync
- Repath flow for missing files (per-file modal picker)
- Camera state (center + zoom + bearing + pitch) round-tripped via webview RPC

#### Discovery features (Phase 4)
- `Maps Viewer: Set Primary Key…` — two-step quick-pick (layer → property)
- `Maps Viewer: Locate Feature…` — flat quick-pick of PK values; map flies + brief yellow pulse
- `Maps Viewer: Set Country Scope…` — 47 curated countries + World
- Optional **Point Render** mode that collapses visually tiny line/polygon features into fixed-size dots based on current zoom
- Feature coordinate inspection, right-click point locating, OSM/GraphHopper open links, and OSM point query
- Editor-to-map zoom: click inside a `.geojson` feature record to zoom the open map to that feature
- Right-click locate points now clear when the user left-clicks the map
- Adding a GeoJSON to an existing map now prefers unused auto-palette colors before repeating

#### Polish + Publish (Phase 5)
- Marketplace icon (256×256 PNG, rendered from SVG)
- Marketplace metadata: `categories`, `keywords`, `repository`, `bugs`, `homepage`, `qna`
- This CHANGELOG, the marketplace-quality README, and privacy doc
- One-shot welcome notification on first activation per major version
- GitHub Actions CI (typecheck + test + build) and tag-triggered publish workflow
- ARIA labels + keyboard-friendly controls on the LayersPanel + popup

### Privacy

No telemetry. Mapbox token stored locally in `SecretStorage`. GeoJSON content never leaves the machine. See `docs/privacy.md`.

### Known limitations

- 50 MB hard cap on a single GeoJSON file
- Last-writer-wins on `maps.json` across multiple VS Code windows
- 47 curated country bboxes (extend via `packages/core/src/bbox/country-bboxes.json`)

### Test surface

- 77 unit tests across 11 files (`@maps-viewer/core` + `@maps-viewer/shared`)
- Manual smoke test for webview interactions (no automated browser tests yet)
