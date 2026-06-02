import * as vscode from 'vscode';
import { COUNTRY_BBOXES } from '@maps-viewer/core';
import { MapPanel } from '../map-panel.js';
import type { Logger } from '../util/logger.js';

interface CountryItem extends vscode.QuickPickItem {
  code: string | null;
}

/**
 * Cmd+Shift+P → "Maps Viewer: Set Country Scope".
 *
 * Quick-pick of curated countries; "World" entry clears the scope. The
 * selection is persisted in the panel's state and propagated to the
 * webview, which fitBounds to the chosen bbox.
 */
export async function setCountryScope(logger: Logger): Promise<void> {
  const panel = MapPanel.activeForWindow();
  if (!panel) {
    void vscode.window.showWarningMessage('Maps Viewer: no active map.');
    return;
  }
  const items: CountryItem[] = [
    { label: '$(globe) World', description: 'Clear scope (default)', code: null },
    ...COUNTRY_BBOXES
      .map((c) => ({ label: c.name, description: c.code, code: c.code } as CountryItem))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];
  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: 'Pick a country to scope the map (filters live)',
    matchOnDescription: true,
  });
  if (!pick) return;
  panel.setCountry(pick.code);
  logger.info(`country scope set: ${pick.code ?? 'World'}`);
}
