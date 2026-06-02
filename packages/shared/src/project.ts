import type { LayerState } from './layer.js';
import type { Basemap } from './messages.js';
import type { CountryCode } from './country.js';

/**
 * Camera position + orientation. Mapbox uses `[lng, lat]` for centers.
 *
 * `bearing` is degrees from north (clockwise positive), `pitch` is degrees
 * from down-looking (0 = top-down, 60 = max tilt).
 */
export interface ProjectCameraState {
  readonly center: readonly [number, number];
  readonly zoom: number;
  readonly bearing: number;
  readonly pitch: number;
}

/**
 * File reference inside a saved Project.
 *
 * `pathKind` controls how `path` is resolved:
 *   - 'absolute'           — used verbatim
 *   - 'workspaceRelative'  — looked up under the workspace folder named
 *                            `workspaceFolder` (basename), falling back to
 *                            the first open workspace folder if missing.
 *                            If the file can't be located, the open flow
 *                            prompts the user to repath.
 *
 * `layerId` matches the `id` in the persisted LayerState so we can re-load
 * GeoJSON content by id and the layer state lines up.
 */
export interface ProjectFileRef {
  readonly layerId: string;
  readonly path: string;
  readonly pathKind: 'absolute' | 'workspaceRelative';
  readonly workspaceFolder?: string;
}

/**
 * Persisted map project.
 *
 * Notes on optional fields:
 *   - `country`           Phase 4 populates; Phase 3-only projects have it `undefined`
 *   - `primaryKeyByLayer` map of layerId → property key used by Locate
 *   - `tags`              reserved for future favorites/grouping (not in v1)
 *
 * Dates are ISO 8601 UTC strings (`"2026-05-29T14:55:00.000Z"`).
 */
export interface Project {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly files: ReadonlyArray<ProjectFileRef>;
  readonly layerState: LayerState;
  readonly basemap: Basemap;
  readonly camera: ProjectCameraState;
  readonly country?: CountryCode;
  readonly primaryKeyByLayer?: Readonly<Record<string, string>>;
  readonly tags?: ReadonlyArray<string>;
}

/** Schema-versioned wrapper around the array of projects. */
export interface MapsJsonV1 {
  readonly version: 1;
  readonly projects: ReadonlyArray<Project>;
}

/** Current MapsJson shape. Future versions form a union here. */
export type MapsJson = MapsJsonV1;

/** Empty initial document. */
export const EMPTY_MAPS_JSON: MapsJson = { version: 1, projects: [] };

/** Subset of Project filled in by `MapPanel.getProjectSnapshot()` — id/name/timestamps come from the save command. */
export type ProjectSnapshot = Omit<Project, 'id' | 'name' | 'createdAt' | 'updatedAt'>;
