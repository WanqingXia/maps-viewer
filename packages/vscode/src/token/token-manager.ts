import * as vscode from 'vscode';
import { TokenMissingError } from '@maps-viewer/shared';

/** SecretStorage key under which we persist the Mapbox public token. */
export const MAPBOX_TOKEN_KEY = 'mapsViewer.mapboxToken';

/**
 * Thin wrapper around `vscode.SecretStorage` so token reads/writes stay in
 * one place. Tests can mock this; everything else in the extension talks
 * only to `TokenManager`.
 */
export class TokenManager {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  get(): Thenable<string | undefined> {
    return this.secrets.get(MAPBOX_TOKEN_KEY);
  }

  async getOrThrow(): Promise<string> {
    const value = await this.get();
    if (!value) throw new TokenMissingError();
    return value;
  }

  set(token: string): Thenable<void> {
    return this.secrets.store(MAPBOX_TOKEN_KEY, token);
  }

  clear(): Thenable<void> {
    return this.secrets.delete(MAPBOX_TOKEN_KEY);
  }
}
