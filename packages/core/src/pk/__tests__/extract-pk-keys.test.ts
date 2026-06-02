import { describe, it, expect } from 'vitest';
import type { Feature } from 'geojson';
import { extractPropertyKeys, collectPkValues } from '../extract-pk-keys.js';

const feature = (props: Record<string, unknown> | null): Feature => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [0, 0] },
  properties: props,
});

describe('extractPropertyKeys', () => {
  it('returns [] for empty input', () => {
    expect(extractPropertyKeys([])).toEqual([]);
  });

  it('unions keys across heterogeneous features, sorted', () => {
    const features = [
      feature({ a: 1, b: 2 }),
      feature({ b: 3, c: 4 }),
      feature(null),
    ];
    expect(extractPropertyKeys(features)).toEqual(['a', 'b', 'c']);
  });

  it('caps the scan to sampleSize', () => {
    const features = [feature({ a: 1 })];
    for (let i = 0; i < 50; i++) features.push(feature({ [`k${i}`]: i }));
    expect(extractPropertyKeys(features, 1)).toEqual(['a']);
  });
});

describe('collectPkValues', () => {
  it('coerces numeric / boolean values to strings', () => {
    const features = [feature({ id: 1 }), feature({ id: 2 }), feature({ id: true })];
    expect(collectPkValues(features, 'id')).toEqual(['1', '2', 'true']);
  });

  it('skips features missing the key (or null)', () => {
    const features = [
      feature({ id: 'A' }),
      feature({ other: 'B' }),
      feature({ id: null }),
      feature(null),
    ];
    expect(collectPkValues(features, 'id')).toEqual(['A']);
  });

  it('preserves first-seen order and dedupes', () => {
    const features = [
      feature({ id: 'B' }),
      feature({ id: 'A' }),
      feature({ id: 'B' }),
      feature({ id: 'C' }),
    ];
    expect(collectPkValues(features, 'id')).toEqual(['B', 'A', 'C']);
  });
});
