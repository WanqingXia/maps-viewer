import * as vscode from 'vscode';
import { saveProject, type SaveProjectCtx } from './save-project.js';
import { MapPanel } from '../../map-panel.js';

/**
 * Toolbar "+" button on the Maps Manager view title.
 *
 * Implementation: if a map is currently open, route to `saveProject`
 * (the natural flow — "I have a configured map, save it as a project").
 * If no map is open, surface a hint pointing the user to "View in Maps".
 */
export async function newProject(ctx: SaveProjectCtx): Promise<void> {
  const panel = MapPanel.activeForWindow();
  if (!panel) {
    void vscode.window.showInformationMessage(
      'Open a map first (right-click a .geojson → "View in Maps"). Then click "+" again to save it as a project.',
    );
    return;
  }
  await saveProject(ctx);
}
