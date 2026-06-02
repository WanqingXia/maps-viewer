import * as vscode from 'vscode';
import { extractPropertyKeys } from '@maps-viewer/core';
import { MapPanel } from '../map-panel.js';
import type { Logger } from '../util/logger.js';

interface LayerItem extends vscode.QuickPickItem {
  layerId: string;
}

interface PkItem extends vscode.QuickPickItem {
  key: string | null;
}

/**
 * Cmd+Shift+P → "Maps Viewer: Set Primary Key…".
 *
 * Two-step quick-pick: (1) pick a layer, (2) pick a property key (with a
 * "(none)" option to clear the PK).
 */
export async function setPrimaryKey(logger: Logger): Promise<void> {
  const panel = MapPanel.activeForWindow();
  if (!panel) {
    void vscode.window.showWarningMessage('Maps Viewer: no active map.');
    return;
  }
  const state = panel.getLayerState();
  if (state.layers.length === 0) {
    void vscode.window.showWarningMessage('Maps Viewer: no layers in this map.');
    return;
  }
  const layerItems: LayerItem[] = state.layers.map((l) => {
    const current = panel.getPrimaryKeyFor(l.id);
    const desc = current ? `current: ${current}` : 'no primary key';
    return { label: l.displayName, description: desc, layerId: l.id };
  });
  const layerPick = await vscode.window.showQuickPick(layerItems, {
    placeHolder: 'Pick a layer to set its primary key',
  });
  if (!layerPick) return;

  const fc = panel.getLayerData(layerPick.layerId);
  if (!fc) {
    void vscode.window.showErrorMessage('Maps Viewer: layer data unavailable.');
    return;
  }
  const keys = extractPropertyKeys(fc.features);
  if (keys.length === 0) {
    void vscode.window.showInformationMessage(
      `Maps Viewer: "${layerPick.label}" has no feature properties — nothing to use as a primary key.`,
    );
    return;
  }
  const items: PkItem[] = [
    { label: '$(close) (none)', description: 'Clear the primary key', key: null },
    ...keys.map<PkItem>((k) => ({ label: k, key: k })),
  ];
  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: `Pick a property for "${layerPick.label}"`,
  });
  if (!pick) return;
  panel.setPrimaryKey(layerPick.layerId, pick.key);
  logger.info(`primary key for ${layerPick.layerId}: ${pick.key ?? '(none)'}`);
}
