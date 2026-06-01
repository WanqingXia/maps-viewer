import * as vscode from 'vscode';
import { DEFAULT_LAYER_COLOR } from '@maps-viewer/shared';
import { readGeoJsonFile } from '../util/parse-geojson.js';
import { ensureToken } from '../token/prompt-for-token.js';
import { MapPanel } from '../map-panel.js';
import type { TokenManager } from '../token/token-manager.js';
import type { Logger } from '../util/logger.js';

export interface ViewInMapsCtx {
  extUri: vscode.Uri;
  webviewDistUri: vscode.Uri;
  webviewVendorUri: vscode.Uri;
  tokenManager: TokenManager;
  logger: Logger;
}

/** Entry from the right-click menu or the command palette. */
export async function viewInMaps(ctx: ViewInMapsCtx, uri?: vscode.Uri): Promise<void> {
  const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
  if (!targetUri) {
    void vscode.window.showWarningMessage('No GeoJSON file selected.');
    return;
  }

  try {
    const token = await ensureToken(ctx.tokenManager);
    const fc = await readGeoJsonFile(targetUri);
    const fileName = targetUri.path.split('/').pop() ?? 'untitled.geojson';

    const defaultBasemap = vscode.workspace
      .getConfiguration('mapsViewer')
      .get<'standard' | 'satellite'>('defaultBasemap', 'standard');

    await MapPanel.show({
      key: targetUri.toString(),
      title: `Maps Viewer: ${fileName}`,
      extUri: ctx.extUri,
      webviewDistUri: ctx.webviewDistUri,
      webviewVendorUri: ctx.webviewVendorUri,
      logger: ctx.logger,
      mapboxToken: token,
      basemap: defaultBasemap,
      layers: [{
        layerId: `layer-${Date.now()}`,
        fileName,
        geojson: fc,
        color: DEFAULT_LAYER_COLOR,
        strokeWidth: 3,
      }],
    });
  } catch (err) {
    ctx.logger.error('viewInMaps failed', err);
    const msg = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(`Maps Viewer: ${msg}`);
  }
}
