import * as vscode from 'vscode';
import { collectPkValues } from '@maps-viewer/core';
import { MapPanel } from '../map-panel.js';
import type { Logger } from '../util/logger.js';

interface LocateItem extends vscode.QuickPickItem {
  layerId: string;
  value: string;
}

/**
 * Cmd+Shift+P → "Maps Viewer: Locate Feature".
 *
 * Builds a flat quick-pick from all PK-enabled layers' PK values, then
 * asks MapPanel to fly to the chosen feature.
 */
export async function locateFeature(logger: Logger): Promise<void> {
  const panel = MapPanel.activeForWindow();
  if (!panel) {
    void vscode.window.showWarningMessage('Maps Viewer: no active map.');
    return;
  }
  const state = panel.getLayerState();
  const items: LocateItem[] = [];

  for (const layer of state.layers) {
    const pk = panel.getPrimaryKeyFor(layer.id);
    if (!pk) continue;
    const fc = panel.getLayerData(layer.id);
    if (!fc) continue;
    const values = collectPkValues(fc.features, pk);
    for (const value of values) {
      items.push({
        label: value,
        description: `${layer.displayName} · ${pk}`,
        layerId: layer.id,
        value,
      });
    }
  }

  if (items.length === 0) {
    void vscode.window.showInformationMessage(
      'Maps Viewer: no layers have a primary key set. Run "Set Primary Key…" first.',
    );
    return;
  }

  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: 'Type a record value to locate (filters live)',
    matchOnDescription: true,
  });
  if (!pick) return;
  const ok = panel.locateFeature(pick.layerId, pick.value);
  if (!ok) {
    logger.warn(`locateFeature: no match for ${pick.layerId} ${pick.value}`);
    void vscode.window.showWarningMessage(`Maps Viewer: feature not found.`);
  }
}
