/**
 * Base error class for all domain errors thrown by Maps Viewer code.
 *
 * - Subclass for specific failure modes (e.g. `TokenMissingError`).
 * - Always populate `code` with a stable identifier; callers may switch on it.
 * - Pass the original error in `cause` when wrapping a foreign exception.
 *
 * Caller convention (set at the command boundary in the extension host):
 *   - log via the shared `Logger`
 *   - show a friendly message via `vscode.window.showErrorMessage`
 *   - never silently swallow
 */
export class MapsViewerError extends Error {
  public readonly code: string;
  public readonly cause: unknown;

  constructor(message: string, code: string, cause?: unknown) {
    super(message);
    this.name = 'MapsViewerError';
    this.code = code;
    this.cause = cause;
  }
}

/** Mapbox token is not configured. Surfaced by the first-run token flow. */
export class TokenMissingError extends MapsViewerError {
  constructor() {
    super('Mapbox token is not set.', 'TOKEN_MISSING');
    this.name = 'TokenMissingError';
  }
}
