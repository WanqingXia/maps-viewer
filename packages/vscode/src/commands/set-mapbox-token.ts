import * as vscode from 'vscode';
import { promptAndStoreToken } from '../token/prompt-for-token.js';
import type { TokenManager } from '../token/token-manager.js';
import type { Logger } from '../util/logger.js';

/** Clears any saved token, then re-prompts. Useful for rotating tokens. */
export async function setMapboxToken(tm: TokenManager, logger: Logger): Promise<void> {
  try {
    await tm.clear();
    await promptAndStoreToken(tm);
    void vscode.window.showInformationMessage('Maps Viewer: Mapbox token updated.');
  } catch (err) {
    logger.error('setMapboxToken failed', err);
    const msg = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(`Maps Viewer: ${msg}`);
  }
}
