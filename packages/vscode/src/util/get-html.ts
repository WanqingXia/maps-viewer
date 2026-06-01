import * as vscode from 'vscode';
import { getNonce } from './get-nonce.js';

/**
 * Build the HTML for the Maps Viewer webview.
 *
 * CSP locks the webview to vscode-webview://... resources + Mapbox HTTPS
 * endpoints. The Mapbox CSP-strict UMD bundle is loaded as a same-origin
 * <script> tag; its worker URL is exposed to the page as
 * `window.__MAPBOX_WORKER_URL__` (the webview entry assigns it onto
 * `mapboxgl.workerUrl` before constructing the map).
 *
 * Resource layout (all relative to the extension root's `dist/webview/`
 * directory, which is populated by `esbuild.config.mjs`'s copy step in
 * both dev and packaged VSIX builds):
 *   dist/webview/mapbox-gl-csp.js
 *   dist/webview/mapbox-gl-csp-worker.js
 *   dist/webview/mapbox-gl.css
 *   dist/webview/webview.js
 *   dist/webview/webview.css
 */
export interface BuildHtmlArgs {
  webview: vscode.Webview;
  extUri: vscode.Uri;
  /** Directory containing the bundled webview app + Mapbox vendor files. */
  webviewAssetsUri: vscode.Uri;
  title: string;
}

export function getWebviewHtml(args: BuildHtmlArgs): string {
  const { webview, webviewAssetsUri, title } = args;
  const nonce = getNonce();

  const u = (name: string): vscode.Uri =>
    webview.asWebviewUri(vscode.Uri.joinPath(webviewAssetsUri, name));

  const mapboxJs = u('mapbox-gl-csp.js');
  const mapboxWorker = u('mapbox-gl-csp-worker.js');
  const mapboxCss = u('mapbox-gl.css');
  const webviewJs = u('webview.js');
  const webviewCss = u('webview.css');

  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} https: data: blob:`,
    `script-src 'nonce-${nonce}' ${webview.cspSource}`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    // worker-src must allow blob: so we can construct the Mapbox worker
    // from a Blob URL (same-origin trick — see makeSameOriginWorkerUrl).
    `worker-src ${webview.cspSource} blob:`,
    // connect-src must allow the webview's own resource origin so the
    // bootstrap can `fetch()` the bundled Mapbox worker JS before
    // wrapping it in a Blob.
    `connect-src ${webview.cspSource} https://*.mapbox.com https://*.tiles.mapbox.com https://api.mapbox.com https://events.mapbox.com`,
    `font-src ${webview.cspSource}`,
  ].join('; ');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <link rel="stylesheet" href="${String(mapboxCss)}" />
  <link rel="stylesheet" href="${String(webviewCss)}" />
  <title>${escapeAttr(title)}</title>
</head>
<body>
  <div id="map"></div>
  <script nonce="${nonce}" src="${String(mapboxJs)}"></script>
  <script nonce="${nonce}">
    window.__MAPBOX_WORKER_URL__ = ${JSON.stringify(String(mapboxWorker))};
  </script>
  <script nonce="${nonce}" src="${String(webviewJs)}"></script>
</body>
</html>`;
}

function escapeAttr(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}
