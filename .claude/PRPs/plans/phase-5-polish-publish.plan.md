# Plan: Phase 5 — Polish + Publish

## Summary

Make the extension marketplace-ready. Add the icon, README with GIFs, CHANGELOG, marketplace metadata, decide on telemetry (recommendation: opt-in only / no telemetry), do a perf sweep on a 50MB sample, run an accessibility audit on webview controls, set up CI/CD (lint + typecheck + test on PR), and publish to the VS Code Marketplace and Open VSX. End state: `vsce publish` succeeds and a clean VS Code install works end-to-end with no extra setup beyond pasting a Mapbox token.

## User Story

As a **maintainer**, I want to **publish a polished v0.1.0 that strangers can install and trust**, so that **the extension can begin replacing geojson.io / QGIS workflows for users beyond me/my team**.

## Problem → Solution

After Phase 4, the extension is functionally complete but has no icon, generic README, no CHANGELOG, no CI, no perf data, no accessibility audit. Phase 5 closes those gaps and ships v0.1.0.

## Metadata

- **Complexity**: Medium (no new business logic; mostly metadata, tooling, validation)
- **Source PRD**: `.claude/PRPs/prds/maps-viewer.prd.md`
- **PRD Phase**: Phase 5 — Polish + publish
- **Estimated Files**: ~12

---

## UX Design

### Before (Phase 4)
```
Marketplace listing: doesn't exist
README: minimal dev notes
Install on fresh machine: friction-heavy
```

### After
```
Marketplace listing:
  Maps Viewer
  ★★★★★ (early ratings)
  Icon: stylized map pin with grid
  Description: "View multiple GeoJSON files together with grouping, colors, and saved projects."
  Categories: Visualization, Other
  Screenshots: 3 GIFs (right-click flow, multi-layer panel, Maps Manager sidebar)

Fresh install:
  Install → open .geojson → right-click → "View in Maps" → token prompt → map renders
  Total time: under 90 seconds
```

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| Marketplace listing | n/a | Full listing with icon + GIFs | One-time effort |
| Telemetry | none | Opt-in `mapsViewer.telemetry.enabled = false` default | Documented in privacy section |
| Error messages | technical | User-friendly + "Report Issue" link | Surfaced from existing `MapsViewerError` |
| First run | functional but bare | Welcome notification with quick-start link | Single dismissable info message |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `.claude/PRPs/prds/maps-viewer.prd.md` | "Open Questions" → telemetry | Decide opt-in vs none |
| P0 | `packages/vscode/package.json` | all | Will gain `repository`, `bugs`, `categories`, `icon`, `publisher` |
| P1 | https://code.visualstudio.com/api/working-with-extensions/publishing-extension | full | Marketplace publish flow |
| P1 | https://github.com/eclipse/openvsx/wiki/Publishing-Extensions | full | Publishing to Open VSX |
| P2 | All Phase 0–4 plans | Acceptance Criteria sections | Verify everything still passes |

## External Documentation

| Topic | Source | Key Takeaway |
|---|---|---|
| vsce | https://github.com/microsoft/vscode-vsce | `vsce package`, `vsce publish` |
| ovsx | https://github.com/eclipse/openvsx/wiki/Publishing-Extensions | `npx ovsx publish` |
| Extension manifest reference | https://code.visualstudio.com/api/references/extension-manifest | Required + recommended fields |
| Telemetry guidance | https://code.visualstudio.com/api/extension-guides/telemetry | Respect `telemetry.telemetryLevel` if enabled |
| Webview a11y | https://code.visualstudio.com/api/extension-guides/webview#accessibility | aria roles, keyboard nav, contrast |

---

## Patterns to Mirror

- All patterns from Phases 0–4
- New: **MARKETPLACE_METADATA** below

## New patterns this phase introduces

### MARKETPLACE_METADATA
Single source of truth in `packages/vscode/package.json`:

```jsonc
{
  "name": "maps-viewer",
  "displayName": "Maps Viewer",
  "description": "View multiple GeoJSON files together with grouping, colors, and saved projects. Powered by Mapbox.",
  "version": "0.1.0",
  "publisher": "REAL_PUBLISHER_ID",
  "icon": "resources/icon.png",
  "categories": ["Visualization", "Other"],
  "keywords": ["geojson", "map", "mapbox", "gis", "geo", "viewer"],
  "repository": { "type": "git", "url": "https://github.com/<owner>/maps-viewer.git" },
  "bugs": { "url": "https://github.com/<owner>/maps-viewer/issues" },
  "homepage": "https://github.com/<owner>/maps-viewer#readme",
  "license": "MIT",
  "qna": "marketplace",
  "engines": { "vscode": "^1.85.0" }
}
```

### TELEMETRY_PATTERN (opt-in, minimal — or just none)
If we ship telemetry: off by default + respect VS Code's global `telemetry.telemetryLevel`. Only collect: extension version, `viewInMaps` invocation count per session, `saveProject` count. No file paths, no tokens, no GeoJSON content.

**Recommendation: ship v0.1.0 with NO telemetry.** Measure adoption via Marketplace install count + voluntary feedback. Revisit only if growth stalls.

### ACCESSIBILITY_PATTERN (webview)
- Every interactive element: `role` + `aria-label`
- Keyboard: Tab traverses layer rows; Enter toggles visibility; Space opens color picker
- Color picker swatches have visible focus rings
- Contrast: layer panel text passes WCAG AA on default dark theme
- Screen reader: layer row reads "Layer X, visible, color red, stroke 3"

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `/packages/vscode/resources/icon.png` | CREATE | 256×256 PNG; stylized map-pin + grid |
| `/packages/vscode/package.json` | UPDATE | publisher, icon, categories, keywords, repository, bugs |
| `/README.md` | UPDATE | Full marketplace-quality README with GIFs |
| `/CHANGELOG.md` | CREATE | Keep-a-changelog format |
| `/docs/quickstart.md` | CREATE | Linked from welcome notification |
| `/docs/privacy.md` | CREATE | "No telemetry by default" doc |
| `/.github/workflows/ci.yml` | CREATE | Lint + typecheck + test on PR + main |
| `/.github/workflows/publish.yml` | CREATE | Tag-triggered publish to Marketplace + Open VSX |
| `/.github/ISSUE_TEMPLATE/bug.yml` | CREATE | Structured bug-report form |
| `/.github/ISSUE_TEMPLATE/feature.yml` | CREATE | Feature-request form |
| `/.github/PULL_REQUEST_TEMPLATE.md` | CREATE | Checklist |
| `/packages/vscode/src/welcome.ts` | CREATE | One-shot welcome notification |
| `/packages/vscode/src/extension.ts` | UPDATE | Show welcome; bump version usage |
| `/packages/vscode/.vscodeignore` | UPDATE | Ensure `src/`, tests, configs excluded; `dist/` + `vendor/` included |
| `/scripts/build-vsix.sh` | CREATE | `pnpm build && pnpm --filter maps-viewer run package` wrapper |
| `/LICENSE` | UPDATE | Confirm MIT; populate copyright line |

## NOT Building

- Telemetry collection (recommended off entirely)
- Auto-update mechanism (VS Code handles this)
- In-extension feedback widget (use GitHub issues)
- Multi-language i18n (English only for v0.1)
- vscode.dev / web context support — defer

---

## Step-by-Step Tasks

### Task 1: Design + ship icon
- **ACTION**: 256×256 PNG (and 128×128 fallback if needed)
- **IMPLEMENT**: Single accent color from PALETTE (`#e6194b` reads well on both light + dark Marketplace).
- **GOTCHA**: Marketplace icons must be PNG.
- **VALIDATE**: Preview at 32×32 and 16×16 — still recognizable.

### Task 2: Update `package.json` for Marketplace
- **ACTION**: Replace `PLACEHOLDER` publisher; add MARKETPLACE_METADATA
- **GOTCHA**: Publisher ID registered at https://aka.ms/vscode-create-publisher (one-time per maintainer).
- **GOTCHA**: `repository.url` MUST end with `.git` for Marketplace to display GitHub stats.

### Task 3: Write README
- **ACTION**: Marketplace-quality README at repo root
- **IMPLEMENT**: Sections — Hero/tagline + GIF, Features (3-4 bullets), Quick start (3 steps), Maps Manager GIF, Layers panel GIF, Settings list, Privacy paragraph, Known limitations, Contributing, License.
- **GOTCHA**: Marketplace renders the FIRST image as listing hero — pick the most representative GIF.
- **GOTCHA**: Marketplace rewrites relative paths if `repository` is set (vsce 2.x); absolute GitHub raw URLs also work.

### Task 4: CHANGELOG
- **ACTION**: Keep-a-changelog format
- **IMPLEMENT**:
  ```md
  # Changelog

  All notable changes documented here.
  Format: Keep a Changelog. Versioning: SemVer.

  ## [0.1.0] - Unreleased
  ### Added
  - Right-click `.geojson` → "View in Maps"
  - Mapbox webview with Standard / Satellite toggle
  - Hover highlight (#FFFF00) + properties popup
  - Multi-file layers with 20-color palette, view/hide/rename/delete
  - Layer grouping with shared colors
  - Adjustable stroke width (0–50)
  - Maps Manager sidebar with save/open projects
  - Locate by primary key + country bbox scoping
  - Small-feature-as-dot rendering at low zoom
  - BYO Mapbox token (SecretStorage)
  ```

### Task 5: Welcome notification
- **ACTION**: Shown once per install
- **IMPLEMENT**:
  ```ts
  // packages/vscode/src/welcome.ts
  import * as vscode from 'vscode';
  const WELCOME_KEY = 'mapsViewer.welcomeShown.v1';

  export async function maybeShowWelcome(ctx: vscode.ExtensionContext) {
    if (ctx.globalState.get(WELCOME_KEY)) return;
    const choice = await vscode.window.showInformationMessage(
      `Maps Viewer ${ctx.extension.packageJSON.version} is installed. Right-click any .geojson to open it.`,
      'Quick start', 'Got it',
    );
    if (choice === 'Quick start') {
      await vscode.env.openExternal(vscode.Uri.parse('https://github.com/<owner>/maps-viewer#quick-start'));
    }
    await ctx.globalState.update(WELCOME_KEY, true);
  }
  ```
- **GOTCHA**: Key is versioned (`.v1`) so future major bumps can re-show.

### Task 6: CI workflow
- **ACTION**: GitHub Actions on PR + main
- **IMPLEMENT**:
  ```yaml
  # .github/workflows/ci.yml
  name: ci
  on:
    push: { branches: [main] }
    pull_request:
  jobs:
    test:
      runs-on: ubuntu-latest
      strategy: { matrix: { node: [20, 22] } }
      steps:
        - uses: actions/checkout@v4
        - uses: pnpm/action-setup@v3
          with: { version: 9 }
        - uses: actions/setup-node@v4
          with: { node-version: ${{ matrix.node }}, cache: pnpm }
        - run: pnpm install --frozen-lockfile
        - run: pnpm typecheck
        - run: pnpm test
        - run: pnpm build
        - if: matrix.node == 22
          run: pnpm --filter maps-viewer run package
        - if: matrix.node == 22
          uses: actions/upload-artifact@v4
          with: { name: vsix, path: packages/vscode/*.vsix }
  ```
- **GOTCHA**: `cache: pnpm` delegates lockfile-based caching.

### Task 7: Publish workflow
- **ACTION**: Tag-triggered publish to both Marketplace + Open VSX
- **IMPLEMENT**:
  ```yaml
  # .github/workflows/publish.yml
  name: publish
  on:
    push: { tags: ['v*'] }
  jobs:
    publish:
      runs-on: ubuntu-latest
      permissions: { contents: write }
      steps:
        - uses: actions/checkout@v4
        - uses: pnpm/action-setup@v3
          with: { version: 9 }
        - uses: actions/setup-node@v4
          with: { node-version: 22, cache: pnpm }
        - run: pnpm install --frozen-lockfile
        - run: pnpm build
        - run: pnpm --filter maps-viewer run package
        - name: Publish to VS Code Marketplace
          working-directory: packages/vscode
          env: { VSCE_PAT: ${{ secrets.VSCE_PAT }} }
          run: npx vsce publish --no-dependencies --packagePath maps-viewer-*.vsix
        - name: Publish to Open VSX
          working-directory: packages/vscode
          env: { OVSX_PAT: ${{ secrets.OVSX_PAT }} }
          run: npx ovsx publish maps-viewer-*.vsix
  ```
- **GOTCHA**: `VSCE_PAT` is Azure DevOps PAT with "Marketplace > Publish" scope. `OVSX_PAT` is Open VSX token. Both as repo secrets.

### Task 8: GitHub issue + PR templates
- **ACTION**: Structured bug-report form with required fields (VS Code version, OS, extension version, repro, expected, actual)

### Task 9: Privacy doc
- **ACTION**: Short, plain-English
- **IMPLEMENT**:
  ```md
  # Privacy

  Maps Viewer does not collect telemetry.

  - Mapbox token stored locally via VS Code `SecretStorage`. Never sent to us.
  - GeoJSON files never leave your machine.
  - Webview makes HTTPS requests to `*.mapbox.com` using your token for tiles/styles.
  - Saved projects (`maps.json`) stored locally in global storage (or your `mapsLocation`).

  No analytics, no telemetry, no third-party SDKs.
  ```

### Task 10: Perf sweep
- **ACTION**: Profile a 50MB / 30K-feature sample
- **TARGETS**: time-to-first-render ≤ 6s; hover latency < 50ms; basemap switch < 1s; pan/zoom ≥ 30 FPS
- **GOTCHA**: If targets miss, document in CHANGELOG as known limitation; tippecanoe pipeline is a v0.2 follow-up.

### Task 11: A11y audit
- **ACTION**: Keyboard nav + screen reader smoke test
- **IMPLEMENT**: Tab through every control; Enter toggles visibility; Esc closes popups. macOS VoiceOver should read each row meaningfully.
- **GOTCHA**: Mapbox NavigationControl is mostly accessible; custom basemap toggle + layer panel need ARIA labels added.

### Task 12: Final smoke + tag + ship
- **ACTION**: Bump version, tag, push
- **IMPLEMENT**: `git tag v0.1.0 && git push --tags` triggers publish workflow.
- **VALIDATE**: Listing appears within ~10 min; fresh install → right-click → token → map.

---

## Testing Strategy

This phase has minimal new logic. Most "tests" are validation against the full Phase 0–4 acceptance set.

### Unit Tests (Vitest)
| Test | Input | Expected | Edge Case? |
|---|---|---|---|
| `welcome.maybeShowWelcome` no-op when shown | globalState.get(WELCOME_KEY) = true | does not show | yes |
| `welcome.maybeShowWelcome` shows once | first call | notification fires + state updated | no |

### Edge Cases Checklist
- [ ] Fresh install → welcome appears
- [ ] Reload VS Code → welcome does NOT reappear
- [ ] Upgrade with bumped `WELCOME_KEY` → welcome re-appears (controlled)
- [ ] `git tag v0.1.0` triggers publish workflow once
- [ ] Marketplace listing renders icon, README, GIFs

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
EXPECT: All Phase 0–4 suites still pass

### Build + Package
```bash
pnpm build
pnpm --filter maps-viewer run package
```
EXPECT: `maps-viewer-0.1.0.vsix` < 5MB (mostly Mapbox vendor bundle)

### CI Workflow
```bash
gh workflow view ci
gh run watch
```
EXPECT: ci passes on push/PR

### Marketplace dry run
```bash
cd packages/vscode
npx vsce publish --no-dependencies --packagePath maps-viewer-0.1.0.vsix --pre-release
```
EXPECT: Pre-release publish; verify listing manually.

### Full E2E Smoke (manual)
```
1. Uninstall any local dev version
2. Install from Marketplace
3. Open fresh window → welcome notification appears
4. Right-click a .geojson → "View in Maps"
5. Paste token (first time only)
6. Map renders within 5s on 5MB sample
7. Layers panel + Maps Manager activity-bar icon visible
8. Save project → reopen → restores cleanly
9. Locate works; country scoping works; small features render as dots
```

---

## Acceptance Criteria
- [ ] Icon 256×256 at `resources/icon.png`
- [ ] All MARKETPLACE_METADATA fields populated
- [ ] README marketplace-quality with 3+ GIFs
- [ ] CHANGELOG.md exists with v0.1.0 entry
- [ ] Welcome notification appears once per install
- [ ] CI workflow runs on PR + main
- [ ] Publish workflow ready (tag-triggered)
- [ ] Privacy doc explicit: no telemetry
- [ ] A11y: keyboard navigates all panels; ARIA labels on custom controls
- [ ] Perf targets met OR documented as known limitations
- [ ] VSIX size < 5MB
- [ ] `vsce publish` succeeds (or `--pre-release` for soft launch)

## Completion Checklist
- [ ] All Phase 0–4 acceptance still met
- [ ] No telemetry code paths (or off by default + documented)
- [ ] No `console.log`
- [ ] No PLACEHOLDER strings remain
- [ ] LICENSE year + copyright holder correct
- [ ] README screenshots reflect current UI
- [ ] 7 PRD open questions resolved or explicitly deferred in CHANGELOG

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Marketplace rejects icon / metadata | Low | Medium | Follow manifest reference precisely |
| `vsce publish` fails on first run (PAT scope) | Medium | Medium | Verify PAT has "Marketplace > Publish" scope |
| README GIFs too large (>10MB) | Medium | Low | Compress (gifski) or use webp |
| Open VSX publish lags Marketplace | Low | Low | Best-effort; not blocking |
| Perf miss on 50MB | Medium | Medium | Document; tippecanoe pipeline as v0.2 |
| A11y miss caught post-launch | Medium | Low | Iterate via bug reports |
| Telemetry expectation mismatch | Low | Low | Privacy doc explicit; recommendation = none |

## Notes

- **Soft launch**: use `vsce publish --pre-release` to ship v0.1.0 as pre-release; promote after ~2 weeks of dogfooding.
- **Open VSX** broadens reach to VSCodium / Theia / Gitpod users.
- **Telemetry decision is intentional**: privacy-first reinforces the "your data never leaves your machine" message.
- **Welcome key is versioned** (`v1`) so future major releases can re-introduce a quick-start prompt.
- **PRD open questions**: most are decided in Phase 3/4 plans; this phase ensures none silently slip before publish.
- **v0.2 candidates** (out of scope here): tippecanoe vector tiles for >100K features; vscode.dev / web context; Zed adapter; Shapefile/KML/GPX import; SettingsSync for projects.
