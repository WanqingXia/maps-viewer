import { z } from 'zod';
import type { MapsJson } from '@maps-viewer/shared';
import { EMPTY_MAPS_JSON } from '@maps-viewer/shared';

/**
 * Zod schema for `maps.json`.
 *
 * - Versioned: `version: 1` (literal). Future versions should add another
 *   variant + a migration step rather than mutating in place.
 * - Color values are validated as `#RRGGBB` / `#RRGGBBAA` etc. — anything
 *   that starts with `#` and has 3-8 hex chars.
 * - ISO 8601 strings for timestamps.
 * - Stroke width is clamped to [0, 50] when parsing in (matching the
 *   reducer's runtime clamp).
 */

const Color = z.custom<`#${string}`>(
  (v) => typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v),
  { message: 'Expected a hex color like #RRGGBB' },
);

const Camera = z.object({
  center: z.tuple([z.number(), z.number()]),
  zoom: z.number(),
  bearing: z.number(),
  pitch: z.number(),
});

const FileRef = z.object({
  layerId: z.string(),
  path: z.string(),
  pathKind: z.enum(['absolute', 'workspaceRelative']),
  workspaceFolder: z.string().optional(),
});

const LayerSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  displayName: z.string(),
  sourcePath: z.string(),
  color: Color,
  strokeWidth: z.number().min(0).max(50),
  visible: z.boolean(),
  groupId: z.string().nullable(),
  featureCount: z.number().int().nonnegative(),
});

const GroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: Color,
  visible: z.boolean(),
});

const LayerStateSchema = z.object({
  layers: z.array(LayerSchema),
  groups: z.array(GroupSchema),
});

const Project = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  files: z.array(FileRef),
  layerState: LayerStateSchema,
  basemap: z.enum(['standard', 'satellite']),
  camera: Camera,
  country: z.string().length(2).optional(),
  primaryKeyByLayer: z.record(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

const MapsJsonV1Schema = z.object({
  version: z.literal(1),
  projects: z.array(Project),
});

export { EMPTY_MAPS_JSON };

/**
 * Parse the raw text of a `maps.json` file. Throws `ZodError` with a
 * human-readable message on malformed input.
 */
export function parseMapsJson(raw: string): MapsJson {
  const json = JSON.parse(raw) as unknown;
  return MapsJsonV1Schema.parse(json) as MapsJson;
}

/** Returns true if the value is a parse error from `parseMapsJson`. */
export function isParseError(err: unknown): err is z.ZodError {
  return err instanceof z.ZodError;
}
