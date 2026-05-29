# Plan: Phase 0 — Repo Scaffold

## Summary

Establish a pnpm-workspace TypeScript monorepo with four packages (`shared`, `core`, `webview`, `vscode`), wire up the VS Code extension build pipeline (esbuild for the extension host, Vite for the webview bundle), and verify F5 launches an Extension Host running a "Hello World" command. This is the foundation; **every later phase mirrors the conventions established here**.

## User Story

As a **developer of this extension**, I want **a working monorepo where F5 launches the extension and `pnpm build` produces a publishable artifact**, so that **subsequent phases have a stable platform to build on without architectural rework**.

## Problem → Solution

Empty repo (only `LICENSE`, `.gitignore`, `.gitattributes`) → working pnpm monorepo with 4 packages, build pipeline, F5 debug setup, and a smoke-test command that prints to an output channel.

## Metadata

- **Complexity**: Medium (scaffolding is mechanical but touches many config files)
- **Source PRD**: `.claude/PRPs/prds/maps-viewer.prd.md`
- **PRD Phase**: Phase 0 — Repo scaffold
- **Estimated Files**: ~25 (mostly config, no business logic yet)

---

## UX Design

### Before
```
┌──────────────────────────────────────────────────────┐
│  Empty repo. No way to run, no way to build.         │
│  $ ls → LICENSE, .gitignore, .gitattributes          │
└──────────────────────────────────────────────────────┘
```

### After
```
┌──────────────────────────────────────────────────────┐
│  $ pnpm install                                       │
│  $ pnpm build              # all packages build OK    │
│  $ code .                                             │
│  → F5 launches Extension Host                         │
│  → Cmd+Shift+P → "Maps Viewer: About" prints to       │
│    "Maps Viewer" output channel: "v0.0.1 hello"       │
└──────────────────────────────────────────────────────┘
```

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| F5 in VS Code | nothing | Extension Host launches | Validates the build wiring end-to-end |
| `pnpm build` | n/a | All 4 packages compile | Catches workspace mis-config |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `.claude/PRPs/prds/maps-viewer.prd.md` | "Technical Approach" + "Architecture Notes" | Authoritative spec for the package layout |
| P1 | `.gitignore` | all (10 lines) | Will be updated to add `node_modules`, `dist`, `*.vsix`, `.DS_Store` |

## External Documentation

| Topic | Source | Key Takeaway |
|---|---|---|
| pnpm workspaces | https://pnpm.io/workspaces | Use `pnpm-workspace.yaml`; reference workspace packages via `"@maps-viewer/shared": "workspace:*"` |
| VS Code extension API | https://code.visualstudio.com/api/get-started/your-first-extension | `package.json` `contributes` block + `engines.vscode` + `activationEvents` |
| esbuild for VS Code | https://code.visualstudio.com/api/working-with-extensions/bundling-extension | Bundle extension host (Node target, CJS, `external: ['vscode']`) |
| Vite library mode | https://vitejs.dev/guide/build.html#library-mode | Bundle webview as IIFE with predictable filename for `asWebviewUri()` |
| @types/vscode pinning | https://code.visualstudio.com/api/working-with-extensions/publishing-extension#prerequisites | `@types/vscode` major must be ≤ `engines.vscode` |

---

## Patterns to Establish (this phase introduces them; all later phases mirror)

### PACKAGE_NAMING
Workspace packages use the `@maps-viewer/<pkg>` scope. The published VS Code extension itself is `maps-viewer` (no scope) — only that root `packages/vscode/package.json` is published.

```jsonc
// packages/shared/package.json
{
  "name": "@maps-viewer/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } }
}
```

### FILE_NAMING
- Files: **kebab-case** (`map-panel.ts`, `token-manager.ts`)
- Types/Classes/Interfaces: **PascalCase** (`MapPanel`, `TokenManager`)
- Functions/variables: **camelCase**
- Constants: **UPPER_SNAKE_CASE**
- Tests: colocated `__tests__/<file>.test.ts` next to the implementation

### MODULE_SYSTEM
ESM everywhere. `"type": "module"` in every `package.json`. Use `.js` import suffixes in TS sources (TS resolves them via `moduleResolution: "bundler"`).

### TS_CONFIG
Single `tsconfig.base.json` at the root with strict + bundler resolution; each package extends it and adds its own `outDir` / `rootDir` / `lib`.

```jsonc
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  },
  "exclude": ["**/dist", "**/node_modules"]
}
```

### LOGGING
Single output channel per extension instance, created once on activate, exposed via a `Logger` wrapper. Levels: `info`, `warn`, `error`. No `console.log` in production paths.

```ts
// packages/vscode/src/util/logger.ts
import * as vscode from 'vscode';

export class Logger {
  private constructor(private channel: vscode.OutputChannel) {}
  static create(name = 'Maps Viewer'): Logger {
    return new Logger(vscode.window.createOutputChannel(name));
  }
  info(msg: string, ...args: unknown[]) { this.channel.appendLine(`[info]  ${this.fmt(msg, args)}`); }
  warn(msg: string, ...args: unknown[]) { this.channel.appendLine(`[warn]  ${this.fmt(msg, args)}`); }
  error(msg: string, err?: unknown) { this.channel.appendLine(`[error] ${msg}${err ? ' :: ' + String(err) : ''}`); }
  show() { this.channel.show(); }
  private fmt(msg: string, args: unknown[]) {
    return args.length ? `${msg} ${args.map(a => JSON.stringify(a)).join(' ')}` : msg;
  }
}
```

### ERROR_HANDLING
Domain errors are subclasses of `MapsViewerError`. Caller catches → logs via Logger → surfaces user-visible message via `vscode.window.showErrorMessage`. Never swallow.

```ts
// packages/shared/src/errors.ts
export class MapsViewerError extends Error {
  constructor(message: string, public readonly code: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'MapsViewerError';
  }
}
export class TokenMissingError extends MapsViewerError {
  constructor() { super('Mapbox token is not set.', 'TOKEN_MISSING'); }
}
```

### BUILD_PIPELINE
- `packages/shared` + `packages/core` → `tsc` (library compilation, produces `.d.ts`)
- `packages/vscode` → `esbuild` (single bundled CJS for the extension host, `external: ['vscode']`)
- `packages/webview` → `vite build` (IIFE, predictable asset names so the extension can `asWebviewUri()` them)

### TEST_FRAMEWORK
**Vitest** for unit tests in `shared` + `core` (pure code, no VS Code API). Tests live in `__tests__/` next to the source.

```ts
// packages/core/src/__tests__/smoke.test.ts
import { describe, it, expect } from 'vitest';
describe('smoke', () => {
  it('passes', () => { expect(1 + 1).toBe(2); });
});
```

The `vscode` and `webview` packages skip automated tests in Phase 0; later phases use VS Code's `@vscode/test-electron` for extension tests if/when needed.

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `/.gitignore` | UPDATE | Add `node_modules`, `dist`, `out`, `*.vsix`, `.DS_Store`, `.vscode-test` |
| `/package.json` | CREATE | Workspace root with shared scripts |
| `/pnpm-workspace.yaml` | CREATE | Declare `packages/*` |
| `/tsconfig.base.json` | CREATE | Shared compiler options |
| `/.npmrc` | CREATE | `auto-install-peers=true`, `engine-strict=true` |
| `/.editorconfig` | CREATE | Cross-editor consistency |
| `/.vscode/launch.json` | CREATE | F5 → Extension Host with `--extensionDevelopmentPath` |
| `/.vscode/tasks.json` | CREATE | "watch" task that runs alongside debug |
| `/.vscode/extensions.json` | CREATE | Recommend ESLint, Prettier, dbaeumer.vscode-eslint |
| `/.vscode/settings.json` | CREATE | Workspace TS version, format on save |
| `/README.md` | CREATE | Dev setup + architecture overview |
| `/packages/shared/package.json` | CREATE | `@maps-viewer/shared` |
| `/packages/shared/tsconfig.json` | CREATE | Extends base |
| `/packages/shared/src/index.ts` | CREATE | Barrel re-export |
| `/packages/shared/src/errors.ts` | CREATE | `MapsViewerError` + subclasses |
| `/packages/core/package.json` | CREATE | `@maps-viewer/core`, depends on shared |
| `/packages/core/tsconfig.json` | CREATE | Extends base |
| `/packages/core/src/index.ts` | CREATE | Barrel re-export (empty for now) |
| `/packages/core/vitest.config.ts` | CREATE | Vitest config |
| `/packages/core/src/__tests__/smoke.test.ts` | CREATE | One sanity test to verify Vitest wiring |
| `/packages/webview/package.json` | CREATE | `@maps-viewer/webview`, build script `vite build` |
| `/packages/webview/tsconfig.json` | CREATE | Extends base + `lib: ['ES2022', 'DOM']` |
| `/packages/webview/vite.config.ts` | CREATE | IIFE output, fixed filename |
| `/packages/webview/index.html` | CREATE | Stub HTML (real content lands in Phase 1) |
| `/packages/webview/src/main.ts` | CREATE | Stub entry that posts `{type:'ready'}` to extension |
| `/packages/vscode/package.json` | CREATE | The publishable extension manifest |
| `/packages/vscode/tsconfig.json` | CREATE | Extends base + `lib: ['ES2022']` |
| `/packages/vscode/esbuild.config.mjs` | CREATE | Build extension host (CJS, node, external vscode) |
| `/packages/vscode/.vscodeignore` | CREATE | Exclude src, test fixtures from VSIX |
| `/packages/vscode/src/extension.ts` | CREATE | `activate` / `deactivate`, register hello-world cmd |
| `/packages/vscode/src/util/logger.ts` | CREATE | Output channel wrapper (see pattern above) |

## NOT Building

- Any business logic (Mapbox, GeoJSON parsing, layers, projects) — Phase 1+
- The `View in Maps` command, context-menu integration — Phase 1
- Vendoring `mapbox-gl-csp.js` — Phase 1
- Maps Manager tree view — Phase 3
- CI/CD (GitHub Actions) — Phase 5
- Marketplace icon, README screenshots — Phase 5

---

## Step-by-Step Tasks

### Task 1: Update root `.gitignore`
- **ACTION**: Append ignore patterns
- **IMPLEMENT**:
  ```
  node_modules/
  dist/
  out/
  *.vsix
  .DS_Store
  .vscode-test/
  coverage/
  ```
- **VALIDATE**: `git status` does not list any of those paths after `pnpm install`

### Task 2: Create root `package.json`
- **ACTION**: Workspace root with shared scripts
- **IMPLEMENT**:
  ```jsonc
  {
    "name": "maps-viewer-workspace",
    "version": "0.0.0",
    "private": true,
    "packageManager": "pnpm@9.0.0",
    "scripts": {
      "build": "pnpm -r --filter='./packages/*' run build",
      "watch": "pnpm -r --parallel --filter='./packages/*' run watch",
      "test": "pnpm --filter '@maps-viewer/core' run test",
      "typecheck": "pnpm -r run typecheck",
      "clean": "pnpm -r exec rm -rf dist out"
    },
    "devDependencies": {
      "typescript": "^5.4.0",
      "@types/node": "^20.11.0"
    }
  }
  ```
- **GOTCHA**: `packageManager` field with version is recommended by Corepack; don't pin to a version older than 8.
- **VALIDATE**: `pnpm install` succeeds

### Task 3: Create `pnpm-workspace.yaml`
- **ACTION**: Declare workspace globs
- **IMPLEMENT**: `packages:\n  - "packages/*"`
- **VALIDATE**: `pnpm list -r --depth -1` lists all 4 packages once they're created

### Task 4: Create `tsconfig.base.json`
- **ACTION**: Shared compiler options
- **IMPLEMENT**: As in TS_CONFIG pattern above
- **GOTCHA**: `moduleResolution: "bundler"` requires TS 5.0+; pin TS ≥ 5.4
- **VALIDATE**: TS errors appear on a deliberate `const x: string = 1` test

### Task 5: Scaffold `packages/shared`
- **ACTION**: Create `package.json`, `tsconfig.json`, `src/index.ts`, `src/errors.ts`
- **IMPLEMENT**:
  - `package.json` per PACKAGE_NAMING pattern, scripts: `build: "tsc -p tsconfig.json"`, `watch: "tsc -w -p tsconfig.json"`, `typecheck: "tsc --noEmit -p tsconfig.json"`
  - `tsconfig.json` extends `../../tsconfig.base.json`, `outDir: "./dist"`, `rootDir: "./src"`, `include: ["src/**/*"]`
  - `src/errors.ts` — `MapsViewerError` and `TokenMissingError` (see ERROR_HANDLING pattern)
  - `src/index.ts` — `export * from './errors.js';`
- **VALIDATE**: `pnpm --filter @maps-viewer/shared run build` produces `dist/index.js` and `dist/errors.d.ts`

### Task 6: Scaffold `packages/core`
- **ACTION**: Create `package.json`, `tsconfig.json`, `src/index.ts`, smoke test, Vitest config
- **IMPLEMENT**:
  - `package.json` depends on `"@maps-viewer/shared": "workspace:*"`, devDependency `vitest`
  - Scripts: `build`, `watch`, `typecheck`, `test: "vitest run"`, `test:watch: "vitest"`
  - `vitest.config.ts`: minimal — `import { defineConfig } from 'vitest/config'; export default defineConfig({});`
  - `src/__tests__/smoke.test.ts` per TEST_FRAMEWORK pattern
- **VALIDATE**: `pnpm --filter @maps-viewer/core run test` passes 1 test

### Task 7: Scaffold `packages/webview`
- **ACTION**: Create with Vite library-mode config; stub `main.ts`
- **IMPLEMENT**:
  - `package.json`: deps `vite`, build script `"build": "vite build"`, `watch: "vite build --watch"`
  - `tsconfig.json`: extends base, adds `"lib": ["ES2022", "DOM"]`, `"types": ["vite/client"]`
  - `vite.config.ts`:
    ```ts
    import { defineConfig } from 'vite';
    export default defineConfig({
      build: {
        outDir: 'dist',
        lib: { entry: 'src/main.ts', formats: ['iife'], name: 'MapsViewerWebview', fileName: () => 'webview.js' },
        rollupOptions: { output: { assetFileNames: '[name][extname]' } },
        target: 'es2022',
        sourcemap: true,
        emptyOutDir: true,
      },
    });
    ```
  - `index.html`: minimal `<div id="app"></div>` stub
  - `src/main.ts`: `acquireVsCodeApi()` call wrapped in try/catch (so it can also run in a browser tab during dev); post `{type:'ready'}` to host
- **GOTCHA**: Vite library mode emits CSS as `style.css` unless renamed — `assetFileNames: '[name][extname]'` makes the path predictable
- **VALIDATE**: `pnpm --filter @maps-viewer/webview run build` produces `dist/webview.js`

### Task 8: Scaffold `packages/vscode`
- **ACTION**: Create the publishable extension manifest, esbuild config, `extension.ts` with hello-world command
- **IMPLEMENT**:
  - `package.json`:
    ```jsonc
    {
      "name": "maps-viewer",
      "displayName": "Maps Viewer",
      "publisher": "PLACEHOLDER",
      "version": "0.0.1",
      "private": true,
      "engines": { "vscode": "^1.85.0" },
      "main": "./dist/extension.cjs",
      "activationEvents": [],
      "contributes": {
        "commands": [
          { "command": "mapsViewer.about", "title": "Maps Viewer: About" }
        ]
      },
      "scripts": {
        "build": "node esbuild.config.mjs",
        "watch": "node esbuild.config.mjs --watch",
        "typecheck": "tsc --noEmit -p tsconfig.json",
        "package": "vsce package --no-dependencies"
      },
      "dependencies": {
        "@maps-viewer/shared": "workspace:*",
        "@maps-viewer/core": "workspace:*"
      },
      "devDependencies": {
        "@types/vscode": "^1.85.0",
        "@vscode/vsce": "^2.24.0",
        "esbuild": "^0.20.0"
      }
    }
    ```
  - `tsconfig.json`: extends base, `lib: ["ES2022"]`, no DOM
  - `esbuild.config.mjs`:
    ```js
    import { build, context } from 'esbuild';
    const watch = process.argv.includes('--watch');
    const opts = {
      entryPoints: ['src/extension.ts'],
      outfile: 'dist/extension.cjs',
      bundle: true, format: 'cjs', platform: 'node', target: 'node18',
      external: ['vscode'], sourcemap: true, logLevel: 'info',
    };
    if (watch) { const ctx = await context(opts); await ctx.watch(); }
    else { await build(opts); }
    ```
  - `src/extension.ts`:
    ```ts
    import * as vscode from 'vscode';
    import { Logger } from './util/logger.js';

    let logger: Logger | undefined;

    export function activate(context: vscode.ExtensionContext) {
      logger = Logger.create();
      logger.info(`Maps Viewer v${context.extension.packageJSON.version} activated`);
      context.subscriptions.push(
        vscode.commands.registerCommand('mapsViewer.about', () => {
          logger?.info('About command invoked');
          vscode.window.showInformationMessage(`Maps Viewer v${context.extension.packageJSON.version}`);
        }),
      );
    }
    export function deactivate() { logger?.info('Maps Viewer deactivated'); }
    ```
  - `.vscodeignore`:
    ```
    .vscode/**
    .vscode-test/**
    src/**
    **/*.map
    **/tsconfig.json
    **/esbuild.config.mjs
    node_modules/**/test/**
    ```
- **GOTCHA**: `--no-dependencies` on `vsce package` is required when using pnpm; without it vsce expects npm-style flat node_modules
- **VALIDATE**: `pnpm --filter maps-viewer run build` produces `dist/extension.cjs`

### Task 9: Create `.vscode/launch.json` + `.vscode/tasks.json`
- **ACTION**: F5 debug config that runs the watch task as a preLaunch
- **IMPLEMENT**:
  - `launch.json`:
    ```jsonc
    {
      "version": "0.2.0",
      "configurations": [
        {
          "name": "Run Extension",
          "type": "extensionHost",
          "request": "launch",
          "args": ["--extensionDevelopmentPath=${workspaceFolder}/packages/vscode"],
          "outFiles": ["${workspaceFolder}/packages/vscode/dist/**/*.cjs"],
          "preLaunchTask": "watch all"
        }
      ]
    }
    ```
  - `tasks.json`:
    ```jsonc
    {
      "version": "2.0.0",
      "tasks": [
        {
          "label": "watch all",
          "type": "shell",
          "command": "pnpm run watch",
          "isBackground": true,
          "problemMatcher": ["$tsc-watch"]
        }
      ]
    }
    ```
- **GOTCHA**: `extensionDevelopmentPath` points to the *package directory* (where the extension's `package.json` lives), NOT the workspace root
- **VALIDATE**: F5 → Extension Host launches → Cmd+Shift+P → "Maps Viewer: About" → info notification appears + output channel logs activation

### Task 10: Create `README.md`
- **ACTION**: Project overview + dev setup
- **IMPLEMENT**: Sections — What it is, Status (alpha), Dev setup (`pnpm install` → F5), Architecture (link to PRD), License
- **VALIDATE**: Renders cleanly on GitHub preview

---

## Testing Strategy

### Unit Tests (Vitest)

| Test | Input | Expected Output | Edge Case? |
|---|---|---|---|
| `smoke.test.ts: passes` | n/a | 1+1===2 | no |
| `errors.test.ts: TokenMissingError sets code` | `new TokenMissingError()` | `.code === 'TOKEN_MISSING'` | no |

### Edge Cases Checklist
- [ ] `pnpm install` on a clean machine succeeds
- [ ] `pnpm build` succeeds with no warnings
- [ ] F5 launches with no errors in dev tools
- [ ] `pnpm typecheck` returns 0
- [ ] Extension host shows "Maps Viewer v0.0.1 activated" in output channel on first activation

---

## Validation Commands

### Static Analysis
```bash
pnpm typecheck
```
EXPECT: Zero type errors across all 4 packages

### Unit Tests
```bash
pnpm test
```
EXPECT: Vitest reports 2 passing tests (smoke + errors)

### Build
```bash
pnpm build
```
EXPECT:
- `packages/shared/dist/index.js` exists
- `packages/core/dist/index.js` exists
- `packages/webview/dist/webview.js` exists
- `packages/vscode/dist/extension.cjs` exists

### Extension Host Smoke
```
1. Open repo root in VS Code
2. Press F5
3. In the new window: Cmd+Shift+P → "Maps Viewer: About"
4. Confirm notification "Maps Viewer v0.0.1"
5. View → Output → channel selector → "Maps Viewer" → see "activated" + "About command invoked"
```

### Manual Validation
- [ ] `pnpm install` runs to completion
- [ ] `pnpm build` exits 0
- [ ] `pnpm test` exits 0
- [ ] F5 launches Extension Host
- [ ] "Maps Viewer: About" command works
- [ ] Output channel shows expected log lines
- [ ] No `.DS_Store`, `dist`, or `node_modules` show up in `git status`

---

## Acceptance Criteria
- [ ] All 4 packages exist with correct `package.json`
- [ ] `pnpm install` succeeds with no peer-dep warnings (or only documented ones)
- [ ] `pnpm build` produces all 4 dist artifacts
- [ ] `pnpm test` passes
- [ ] F5 launches Extension Host with the `mapsViewer.about` command working
- [ ] `pnpm --filter maps-viewer run package` produces a `maps-viewer-0.0.1.vsix` (sanity check)
- [ ] README documents the dev loop

## Completion Checklist
- [ ] Patterns documented above match what the code actually does
- [ ] No business logic introduced (this is scaffolding only)
- [ ] No hardcoded paths outside config files
- [ ] `.gitignore` excludes all generated artifacts
- [ ] Self-contained — Phase 1 plan can reference patterns from this plan without further searching

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| pnpm + `vsce` interaction issues (flat node_modules expected) | Medium | Medium | Use `--no-dependencies` on `vsce package`; bundle all deps via esbuild |
| `@types/vscode` version drift vs `engines.vscode` | Low | Low | Pin both to `1.85.x` initially; bump together |
| Vite library mode emitting unexpected asset names | Low | Low | `assetFileNames: '[name][extname]'`; verify in Phase 1 |
| Corepack not available in user's environment | Low | Low | Document `pnpm` install in README; `packageManager` field is a hint, not a hard gate |
| ESM/CJS interop in extension (vscode API is CJS) | Low | Low | esbuild bundles to CJS for extension; shared/core ESM modules are bundled in cleanly |

## Notes

- `publisher` is intentionally `"PLACEHOLDER"` in `packages/vscode/package.json`; Phase 5 (Publish) replaces this with the real Marketplace publisher ID.
- The webview package is intentionally a stub here — the real Mapbox integration lands in Phase 1. We only need the build pipeline working.
- We do NOT add ESLint/Prettier in Phase 0 to keep scope tight; can be added incrementally. The `.editorconfig` covers most cross-IDE consistency.
- The `MapsViewerError` and `TokenMissingError` classes are introduced here so Phase 1's token flow can immediately use them — the error taxonomy belongs in `shared`.
