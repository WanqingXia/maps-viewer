import type { Feature } from 'geojson';

/**
 * Collect the union of property keys present across a feature collection
 * (sampled to the first `sampleSize` features for perf on very large
 * datasets). Result is sorted alphabetically for deterministic display.
 *
 * Empty arrays / features without properties yield an empty result.
 */
export function extractPropertyKeys(
  features: ReadonlyArray<Feature>,
  sampleSize = 100,
): string[] {
  const keys = new Set<string>();
  const limit = Math.min(features.length, sampleSize);
  for (let i = 0; i < limit; i++) {
    const props = features[i]?.properties;
    if (!props) continue;
    for (const k of Object.keys(props)) keys.add(k);
  }
  return [...keys].sort();
}

/**
 * Collect all PK values for a primary key across a feature array.
 *
 * Coerces non-string values via `String(value)` so numeric / boolean PKs
 * work too. Skips features missing the PK. Deduplicates while preserving
 * first-seen order (so Locate quick-pick is stable).
 */
export function collectPkValues(
  features: ReadonlyArray<Feature>,
  primaryKey: string,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of features) {
    const props = f.properties;
    if (!props) continue;
    const raw = props[primaryKey];
    if (raw === null || raw === undefined) continue;
    const value = String(raw);
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}
