/**
 * Copies the Mapbox CSP-strict bundle from node_modules into ./vendor/ so the
 * extension host can serve it via `webview.asWebviewUri()`.
 *
 * The CSP-strict bundle ships a same-origin worker file. The ESM bundle uses
 * a blob: worker URL which violates VS Code webview CSP — do not switch to it.
 */
import { cp, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');
const dst = resolve(pkgRoot, 'vendor');

// Resolve mapbox-gl through the consumer package so pnpm's per-package
// node_modules symlinks are picked up correctly.
const require = createRequire(import.meta.url);
let mapboxPkgPath;
try {
  mapboxPkgPath = require.resolve('mapbox-gl/package.json');
} catch (err) {
  console.error('[copy-mapbox] cannot resolve mapbox-gl. Run `pnpm install` first.');
  console.error(err.message);
  process.exit(1);
}
const src = resolve(dirname(mapboxPkgPath), 'dist');

await mkdir(dst, { recursive: true });
const files = ['mapbox-gl-csp.js', 'mapbox-gl-csp-worker.js', 'mapbox-gl.css'];
for (const f of files) {
  await cp(`${src}/${f}`, `${dst}/${f}`);
}
console.log(`[copy-mapbox] vendored ${files.length} files into ${dst}`);
