import { build, context } from 'esbuild';
import { cp, mkdir, readFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const webviewDist = resolve(here, '../webview/dist');
const webviewVendor = resolve(here, '../webview/vendor');
const bundleTarget = resolve(here, 'dist/webview');

const watch = process.argv.includes('--watch');

/**
 * Copy the sibling webview package's build outputs into this extension's
 * own `dist/webview/` so a VSIX install has everything it needs without
 * referencing sibling packages. Runs after every esbuild build (initial +
 * watch rebuilds).
 *
 * In dev mode (F5 with `extensionDevelopmentPath=packages/vscode`), the
 * extension URI is still `packages/vscode/`, so the same `dist/webview/`
 * path resolves both in dev and in an installed VSIX.
 */
async function copyWebviewAssets() {
  await mkdir(bundleTarget, { recursive: true });

  const files = [
    // Webview app bundle (Vite output)
    [webviewDist, 'webview.js'],
    [webviewDist, 'webview.css'],
    // Mapbox CSP-strict UMD bundle + worker + CSS
    [webviewVendor, 'mapbox-gl-csp.js'],
    [webviewVendor, 'mapbox-gl-csp-worker.js'],
    [webviewVendor, 'mapbox-gl.css'],
  ];

  let copied = 0;
  const missing = [];
  for (const [src, name] of files) {
    const from = `${src}/${name}`;
    try {
      await stat(from);
      await cp(from, `${bundleTarget}/${name}`);
      copied++;
    } catch {
      missing.push(name);
    }
  }

  if (missing.length) {
    console.warn(
      `[esbuild] copyWebviewAssets: skipped ${missing.length} missing file(s): ${missing.join(', ')} — run \`pnpm --filter @maps-viewer/webview run build\` first`,
    );
  } else {
    console.log(`[esbuild] copied ${copied} webview asset(s) -> dist/webview/`);
  }
}

async function readBundledMapboxToken() {
  try {
    const envText = await readFile(resolve(repoRoot, '.env'), 'utf8');
    for (const rawLine of envText.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      if (key !== 'MAPBOX_TOKEN') continue;
      const rawValue = line.slice(eq + 1).trim();
      return rawValue.replace(/^['"]|['"]$/g, '');
    }
  } catch {
    // A missing .env is allowed for contributors; the extension will prompt.
  }
  return '';
}

/** Esbuild plugin: copy webview assets after each (re)build. */
const copyWebviewPlugin = {
  name: 'copy-webview-assets',
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length) return;
      try {
        await copyWebviewAssets();
      } catch (err) {
        console.error('[esbuild] copyWebviewAssets failed:', err);
      }
    });
  },
};

const bundledMapboxToken = await readBundledMapboxToken();

const options = {
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.cjs',
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  external: ['vscode'],
  sourcemap: true,
  define: {
    'process.env.MAPBOX_TOKEN': JSON.stringify(bundledMapboxToken),
  },
  logLevel: 'info',
  plugins: [copyWebviewPlugin],
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('[esbuild] watching for changes...');
} else {
  await build(options);
}
