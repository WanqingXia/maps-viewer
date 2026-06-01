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
 * Resource layout (relative to the *extension* root, which is the
 * `packages/vscode` directory in dev and the VSIX root after packaging):
 *   ../webview/vendor/mapbox-gl-csp.js
 *   ../webview/vendor/mapbox-gl-csp-worker.js
 *   ../webview/vendor/mapbox-gl.css
 *   ../webview/dist/webview.js
 *   ../webview/dist/webview.css
 */
export interface BuildHtmlArgs {
  webview: vscode.Webview;
  extUri: vscode.Uri;
  webviewDistUri: vscode.Uri;
  webviewVendorUri: vscode.Uri;
  title: string;
}

export function getWebviewHtml(args: BuildHtmlArgs): string {
  const { webview, webviewDistUri, webviewVendorUri, title } = args;
  const nonce = getNonce();

  const u = (base: vscode.Uri, name: string): vscode.Uri =>
    webview.asWebviewUri(vscode.Uri.joinPath(base, name));

  const mapboxJs = u(webviewVendorUri, 'mapbox-gl-csp.js');
  const mapboxWorker = u(webviewVendorUri, 'mapbox-gl-csp-worker.js');
  const mapboxCss = u(webviewVendorUri, 'mapbox-gl.css');
  const webviewJs = u(webviewDistUri, 'webview.js');
  const webviewCss = u(webviewDistUri, 'webview.css');

  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} https: data: blob:`,
    `script-src 'nonce-${nonce}' ${webview.cspSource}`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `worker-src ${webview.cspSource} blob:`,
    `connect-src https://*.mapbox.com https://*.tiles.mapbox.com https://api.mapbox.com https://events.mapbox.com`,
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
