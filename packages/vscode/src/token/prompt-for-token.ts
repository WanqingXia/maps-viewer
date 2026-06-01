import * as vscode from 'vscode';
import { TokenMissingError } from '@maps-viewer/shared';
import type { TokenManager } from './token-manager.js';

const GET_TOKEN_URL = 'https://account.mapbox.com/access-tokens/';

/**
 * Returns the saved Mapbox token, prompting the user the first time. The
 * prompt is two-step: an informational message with a "Get free token" button
 * that opens Mapbox's account page in the browser, followed by a password-
 * masked input box.
 *
 * Throws `TokenMissingError` if the user cancels at any step.
 */
export async function ensureToken(tm: TokenManager): Promise<string> {
  const existing = await tm.get();
  if (existing) return existing;

  const choice = await vscode.window.showInformationMessage(
    'Maps Viewer needs a Mapbox public token (starts with "pk.") to render maps.',
    { modal: false },
    'Paste token',
    'Get free token (opens browser)',
    'Cancel',
  );

  if (choice === 'Get free token (opens browser)') {
    await vscode.env.openExternal(vscode.Uri.parse(GET_TOKEN_URL));
  }
  if (choice !== 'Paste token' && choice !== 'Get free token (opens browser)') {
    throw new TokenMissingError();
  }

  const input = await vscode.window.showInputBox({
    prompt: 'Paste your Mapbox public token (starts with "pk.")',
    password: true,
    ignoreFocusOut: true,
    placeHolder: 'pk.eyJ1...',
    validateInput: validateMapboxToken,
  });
  if (!input) throw new TokenMissingError();

  const trimmed = input.trim();
  await tm.set(trimmed);
  return trimmed;
}

/** Reject obviously-wrong tokens. Returns an error string, or undefined if OK. */
export function validateMapboxToken(value: string): string | undefined {
  const v = value.trim();
  if (!v) return 'Token cannot be empty.';
  if (v.startsWith('sk.')) return 'Secret tokens (sk.*) are not allowed — use a public token (pk.*).';
  if (!v.startsWith('pk.')) return 'Token must start with "pk.".';
  if (v.length < 30) return 'Token looks too short.';
  return undefined;
}
