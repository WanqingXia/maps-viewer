import * as vscode from 'vscode';
import { MapPanel } from '../map-panel.js';
import type { Logger } from '../util/logger.js';

/**
 * Add one or more GeoJSON files to the currently active Maps Viewer panel.
 *
 * Surfaced as the "Maps Viewer: Add File to Current Map…" palette command.
 * If no map is open, surfaces a warning and exits — the user should run
 * "View in Maps" first to open one.
 */
export async function addFileToMap(logger: Logger): Promise<void> {
  const panel = MapPanel.activeForWindow();
  if (!panel) {
    void vscode.window.showWarningMessage(
      'No active Maps Viewer panel. Right-click a .geojson file and choose "View in Maps" first.',
    );
    return;
  }

  const picks = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: true,
    openLabel: 'Add to current map',
    filters: { GeoJSON: ['geojson', 'json'] },
  });
  if (!picks || picks.length === 0) return;

  for (const uri of picks) {
    try {
      await panel.addFile(uri);
    } catch (err) {
      logger.error(`addFileToMap failed for ${uri.toString()}`, err);
      const msg = err instanceof Error ? err.message : String(err);
      void vscode.window.showErrorMessage(`Maps Viewer: ${msg}`);
    }
  }
}
