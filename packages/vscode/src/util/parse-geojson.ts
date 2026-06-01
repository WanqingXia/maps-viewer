import * as vscode from 'vscode';
import type { FeatureCollection } from 'geojson';
import { MapsViewerError } from '@maps-viewer/shared';

/** Thrown when GeoJSON file is missing, too large, or fails shape validation. */
export class GeoJsonParseError extends MapsViewerError {
  constructor(detail: string, cause?: unknown) {
    super(`Invalid GeoJSON: ${detail}`, 'GEOJSON_PARSE', cause);
    this.name = 'GeoJsonParseError';
  }
}

/** Hard ceiling on file size in bytes (50 MB). */
export const MAX_BYTES = 50 * 1024 * 1024;

/**
 * Read a `.geojson` file from disk and return a parsed `FeatureCollection`.
 *
 * Validation is intentionally shallow — we reject (a) files larger than
 * `MAX_BYTES`, (b) invalid JSON, and (c) top-level shapes that are not a
 * `FeatureCollection` with a `features` array. Per-feature geometry is NOT
 * validated; Mapbox is tolerant of partial features and we want to show
 * partial results rather than block on a single bad record.
 */
export async function readGeoJsonFile(uri: vscode.Uri): Promise<FeatureCollection> {
  let stat;
  try {
    stat = await vscode.workspace.fs.stat(uri);
  } catch (err) {
    throw new GeoJsonParseError(`unable to stat file (${(err as Error).message})`, err);
  }
  if (stat.size > MAX_BYTES) {
    throw new GeoJsonParseError(
      `file too large (${(stat.size / 1_048_576).toFixed(1)}MB > 50MB)`,
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = await vscode.workspace.fs.readFile(uri);
  } catch (err) {
    throw new GeoJsonParseError(`unable to read file (${(err as Error).message})`, err);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8').decode(bytes));
  } catch (err) {
    throw new GeoJsonParseError('file is not valid JSON', err);
  }

  if (!isFeatureCollection(parsed)) {
    throw new GeoJsonParseError(
      'top-level type must be "FeatureCollection" with a "features" array',
    );
  }
  return parsed;
}

function isFeatureCollection(v: unknown): v is FeatureCollection {
  if (v === null || typeof v !== 'object') return false;
  const obj = v as { type?: unknown; features?: unknown };
  return obj.type === 'FeatureCollection' && Array.isArray(obj.features);
}
