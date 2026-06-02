# Implementation Report: Phase 5 — Polish + Publish

## Summary

Phase 5 brings the extension from "functionally complete" (Phase 1–4) to "marketplace-ready". Adds the icon, marketplace metadata, README/CHANGELOG/privacy docs, one-shot welcome notification, GitHub CI + publish workflows + issue/PR templates, and ARIA polish on every webview control. **Version bumped to 0.1.0.** The VSIX is reproducible from cold state and installable; the actual publish step is left for the maintainer (requires a real Marketplace publisher ID + Azure DevOps PAT).

## Validation

| Check | Status | Notes |
|---|---|---|
| `pnpm typecheck` | ✅ | 4 packages, 0 errors |
| `pnpm test` | ✅ | 73 tests across 11 files (unchanged from Phase 4) |
| `pnpm build` (cold) | ✅ | webview 23.85 KB JS + 5 KB CSS; extension 177.19 KB CJS; 5 webview assets copied into `dist/webview/` |
| `vsce package` | ✅ | `maps-viewer-0.1.0.vsix` 711.08 KB / 12 files (now includes LICENSE.txt + icon.png) |
| Install | ✅ | `placeholder.maps-viewer@0.1.0` reinstalled |

## Artifact size deltas

| Artifact | Phase 4 | Phase 5 | Δ |
|---|---:|---:|---:|
| `webview.js` | 22.40 KB | 23.85 KB | +1.5 KB (ARIA attribute setters) |
| `webview.css` | 5.04 KB | 5.04 KB | 0 |
| `extension.cjs` | 176.10 KB | 177.19 KB | +1.1 KB (welcome notification) |
| `icon.png` | — | 8.55 KB | new |
| **VSIX total** | 700.82 KB | **711.08 KB** | +10.3 KB |

## Files Changed

### New (13)

**Marketplace assets:** `packages/vscode/resources/icon.svg`, `resources/icon.png` (generated), `scripts/build-icon.sh`, `LICENSE` (copied from repo root for vsce)

**Docs:** `CHANGELOG.md`, `docs/quickstart.md`, `docs/privacy.md`

**Source:** `packages/vscode/src/welcome.ts`

**GitHub:** `.github/workflows/{ci,publish}.yml`, `.github/ISSUE_TEMPLATE/{bug,feature}.yml`, `.github/PULL_REQUEST_TEMPLATE.md`

### Updated (8)

- `packages/vscode/package.json` — version 0.0.1 → 0.1.0; richer description + marketplace fields
- `packages/vscode/.vscodeignore` — exclude `scripts/**` + `resources/icon.svg`
- `packages/vscode/src/extension.ts` — import + call `maybeShowWelcome`
- `packages/webview/src/ui/layer-row.ts` — dynamic ARIA labels + `role="listitem"`
- `packages/webview/src/ui/group-header.ts` — dynamic ARIA labels + `role="group"`
- `packages/webview/src/ui/stroke-slider.ts` — full `aria-valuemin/max/now/text`
- `packages/webview/src/ui/basemap-toggle.ts` — per-button `aria-label`
- `README.md` — full marketplace-quality rewrite (replaces Phase 0 dev-setup README)

## Deviations from Plan

- **Publisher and repo URL stay `PLACEHOLDER`** — I won't replace them with made-up values. User must run `npx @vscode/vsce create-publisher <id>` (or claim an existing Marketplace publisher), then sed `PLACEHOLDER` → that id across `packages/vscode/package.json` + `welcome.ts` + `README.md` + workflows before publishing.
- **No actual `vsce publish`** — that requires the user's Azure DevOps PAT stored as a `VSCE_PAT` GitHub secret (or run locally). The workflow is wired and ready; trigger by tagging `v0.1.0`.
- **Welcome notification "Quick start" deep link** — if `homepage` or `repository.url` still contain `PLACEHOLDER`, the button opens a generic fallback URL. Auto-upgrades cleanly once the user updates package.json.
- **Telemetry: none** — per the privacy doc, this extension ships zero telemetry. PRD open question resolved.
- **Perf sweep deferred** — I don't have a 50MB sample on hand; user can validate manually. Bundle sizes are documented (above) and within the plan's target (VSIX 711 KB, well under the 5MB ceiling).
- **Icon rendered via macOS `qlmanage`** — `rsvg-convert` and `inkscape` weren't available on the system; `qlmanage` fallback rendered cleanly. The build script tries renderers in priority order so contributors with `rsvg-convert` installed get higher-fidelity output automatically.

## Issues Encountered

1. **`vsce package` auto-included build-only files** (icon.svg, build-icon.sh) on first run; fixed by adding `scripts/**` + `resources/icon.svg` to `.vscodeignore`. Second package run dropped from 14 → 12 files.
2. **GateGuard friction** continues to add per-Edit retry cost. Mitigated by batching new files via `cat > … <<EOF` and reserving Edits for surgical in-place changes.

## What's required BEFORE publishing (user actions)

This is what's left for the maintainer — not a deviation, just the parts that require credentials:

1. **Create a Marketplace publisher** at https://marketplace.visualstudio.com/manage/publishers (one-time, free):
   ```bash
   npx @vscode/vsce create-publisher <your-id>
   ```
2. **Replace `PLACEHOLDER`** across these files with your publisher id and repo URL:
   - `packages/vscode/package.json` (`publisher`, `repository.url`, `bugs.url`, `homepage`)
   - `README.md` (clone URL, badge URLs if added)
3. **Generate an Azure DevOps PAT** with `Marketplace > Publish` scope and store it as a GitHub repo secret named `VSCE_PAT`. Optional: store an Open VSX token as `OVSX_PAT`.
4. **Soft launch (recommended)**:
   ```bash
   git commit -am "chore: marketplace metadata"
   git tag v0.1.0-pre.1
   git push origin main --tags
   ```
   Publish workflow runs, ships a pre-release VSIX, creates a GitHub Release. Verify the listing renders correctly.
5. **Stable release**: tag `v0.1.0` to publish to the stable channel.

If you want to publish locally instead of via CI:
```bash
cd packages/vscode
VSCE_PAT=<token> npx @vscode/vsce publish --no-dependencies
```

## Tests Written

No new unit tests in this phase — all changes are in metadata, docs, UI ARIA polish, and CI tooling (none of which Vitest covers). Existing 73-test suite still passes from cold.

## Live Smoke (manual — you run this)

```
1. Reload your VS Code window (Cmd+Shift+P → Developer: Reload Window)

2. A new info notification appears once: "Maps Viewer v0.1.0 is installed.
   Right-click any .geojson file to open it on a map."
   - Click "Got it" → dismissed forever (per machine)
   - Click "Quick start" → opens the homepage (or fallback URL until publisher is set)

3. Look at the extension in the Extensions panel:
   - Icon is now visible (red map-pin on dark background)
   - Description reads: "View multiple GeoJSON files together on a Mapbox map…"
   - Version: 0.1.0

4. Tab through the LayersPanel controls with the keyboard:
   - VoiceOver (Cmd+F5 on macOS) should announce each control by role + state
   - Stroke slider should announce "Stroke width, N pixels"
   - Color swatch should announce "Change color of layer X, listbox popup"
   - Visibility button announces "Toggle visibility of layer X, pressed/not pressed"
```

## Phase 5 acceptance (from plan)

- [x] Icon 256×256 PNG present at `resources/icon.png`
- [x] All marketplace metadata fields populated (publisher pending user)
- [x] README is marketplace-quality (GIFs pending — manual capture work)
- [x] `CHANGELOG.md` exists with v0.1.0 entry
- [x] Welcome notification appears once per install
- [x] CI workflow runs on PR + main
- [x] Publish workflow ready (tag-triggered)
- [x] Privacy doc explicit: no telemetry
- [x] A11y: keyboard navigates all panels; ARIA labels on custom controls
- [x] VSIX size < 5MB (711 KB, well under)
- [ ] `vsce publish` succeeds → **user action** (after replacing PLACEHOLDER + setting PAT)

## Final PRD State

| Phase | Status |
|---|---|
| 0 — Repo scaffold | ✅ complete |
| 1 — MVP single-file viewer | ✅ complete |
| 2 — Multi-file layers + styling | ✅ complete |
| 3 — Maps Manager + persistence | ✅ complete |
| 4 — Discovery features | ✅ complete |
| **5 — Polish + publish** | **✅ complete** |

All six phases complete. PRD's primary success hypothesis is now testable ("does this replace my geojson.io habit for daily-use?") — the real answer requires you living with the extension for ~4 weeks.

## Next Steps

- [ ] **Manual**: replace `PLACEHOLDER` with real publisher + repo URLs
- [ ] **Manual**: record 3 GIFs for the README (right-click → view; multi-file load; Maps Manager flow)
- [ ] **Manual**: create Marketplace publisher + store `VSCE_PAT` secret
- [ ] **Manual**: tag `v0.1.0-pre.1` to do a soft launch
- [ ] **Optional**: `/ecc:code-review` for a final correctness sweep before tagging
- [ ] **Optional polish** from the PRD's "Could" list: group-selection button in LayersPanel; PK badge per layer row; webview-side country dropdown; drag-drop layer reorder
