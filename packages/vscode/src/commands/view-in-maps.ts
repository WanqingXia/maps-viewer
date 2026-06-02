import * as vscode from 'vscode';
import { ensureToken } from '../token/prompt-for-token.js';
import { MapPanel } from '../map-panel.js';
import type { TokenManager } from '../token/token-manager.js';
import type { Logger } from '../util/logger.js';

export interface ViewInMapsCtx {
  extUri: vscode.Uri;
  /** Directory containing the bundled webview app + Mapbox vendor files. */
  webviewAssetsUri: vscode.Uri;
  tokenManager: TokenManager;
  logger: Logger;
}

/**
 * Entry point from the right-click context menu or the command palette.
 *
 * Behavior:
 *   - If no panel is open: ensure token, open a new panel with this file.
 *   - If a panel is already open in this window: ask whether to add the
 *     file as a new layer in the existing panel, open a separate panel,
 *     or cancel.
 */
export async function viewInMaps(ctx: ViewInMapsCtx, uri?: vscode.Uri): Promise<void> {
  const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
  if (!targetUri) {
    void vscode.window.showWarningMessage('No GeoJSON file selected.');
    return;
  }

  try {
    const token = await ensureToken(ctx.tokenManager);
    const fileName = targetUri.path.split('/').pop() ?? 'untitled.geojson';
    const defaultBasemap = vscode.workspace
      .getConfiguration('mapsViewer')
      .get<'standard' | 'satellite'>('defaultBasemap', 'standard');

    const active = MapPanel.activeForWindow();
    if (active) {
      const choice = await vscode.window.showQuickPick(
        [
          {
            label: '$(add) Add to current map',
            description: 'Append as a new layer in the open panel',
            id: 'add' as const,
          },
          {
            label: '$(window) Open in new map',
            description: 'Open a separate panel',
            id: 'new' as const,
          },
        ],
        { placeHolder: `A map is already open — what should "${fileName}" do?` },
      );
      if (!choice) return;
      if (choice.id === 'add') {
        await active.addFile(targetUri);
        return;
      }
    }

    const baseKey = targetUri.toString();
    const key = MapPanel.activeForWindow() && !uri
      ? `${baseKey}#${Date.now()}`
      : baseKey;

    await MapPanel.show({
      key,
      title: `Maps Viewer: ${fileName}`,
      extUri: ctx.extUri,
      webviewAssetsUri: ctx.webviewAssetsUri,
      logger: ctx.logger,
      mapboxToken: token,
      basemap: defaultBasemap,
      files: [targetUri],
    });
  } catch (err) {
    ctx.logger.error('viewInMaps failed', err);
    const msg = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(`Maps Viewer: ${msg}`);
  }
}
