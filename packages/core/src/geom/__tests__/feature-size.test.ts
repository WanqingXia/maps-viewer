import { describe, it, expect } from 'vitest';
import type { Feature } from 'geojson';
import { featureLenM } from '../feature-size.js';

function makeFeature(geometry: Feature['geometry']): Feature {
  return { type: 'Feature', geometry, properties: null };
}

describe('featureLenM', () => {
  it('returns 0 for Point', () => {
    expect(featureLenM(makeFeature({ type: 'Point', coordinates: [0, 0] }))).toBe(0);
  });

  it('returns 0 for MultiPoint', () => {
    expect(
      featureLenM(makeFeature({ type: 'MultiPoint', coordinates: [[0, 0], [1, 1]] })),
    ).toBe(0);
  });

  it('returns 0 for null geometry', () => {
    expect(featureLenM(makeFeature(null))).toBe(0);
  });

  it('approximates a 1° equatorial LineString (~111 km)', () => {
    const f = makeFeature({ type: 'LineString', coordinates: [[0, 0], [1, 0]] });
    const m = featureLenM(f);
    expect(m).toBeGreaterThan(110_000);
    expect(m).toBeLessThan(112_000);
  });

  it('approximates a small Polygon (~50m by 50m)', () => {
    const dLng = 50 / 111_000; // ~50m at the equator
    const dLat = 50 / 111_000;
    const f = makeFeature({
      type: 'Polygon',
      coordinates: [[
        [0, 0],
        [dLng, 0],
        [dLng, dLat],
        [0, dLat],
        [0, 0],
      ]],
    });
    const m = featureLenM(f);
    expect(m).toBeGreaterThan(40);
    expect(m).toBeLessThan(70);
  });

  it('MultiPolygon: returns the max-size polygon dimension', () => {
    const tiny: Feature = makeFeature({
      type: 'MultiPolygon',
      coordinates: [
        // big poly: ~1 degree (~111km)
        [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
        // tiny poly
        [[[10, 10], [10.0001, 10], [10.0001, 10.0001], [10, 10.0001], [10, 10]]],
      ],
    });
    expect(featureLenM(tiny)).toBeGreaterThan(100_000);
  });
});
