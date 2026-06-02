import { describe, it, expect } from 'vitest';
import { COUNTRY_BBOXES, findCountry, WORLD_BBOX } from '../country-bboxes.js';

describe('country bbox table', () => {
  it('contains at least 30 entries', () => {
    expect(COUNTRY_BBOXES.length).toBeGreaterThanOrEqual(30);
  });

  it('every entry has a 4-tuple bbox in Mapbox order', () => {
    for (const c of COUNTRY_BBOXES) {
      expect(c.bbox.length).toBe(4);
      const [w, s, e, n] = c.bbox;
      expect(w).toBeLessThan(e);
      expect(s).toBeLessThan(n);
      expect(w).toBeGreaterThanOrEqual(-180);
      expect(e).toBeLessThanOrEqual(180);
      expect(s).toBeGreaterThanOrEqual(-90);
      expect(n).toBeLessThanOrEqual(90);
    }
  });

  it('all codes are unique two-letter uppercase', () => {
    const seen = new Set<string>();
    for (const c of COUNTRY_BBOXES) {
      expect(c.code).toMatch(/^[A-Z]{2}$/);
      expect(seen.has(c.code)).toBe(false);
      seen.add(c.code);
    }
  });

  it('findCountry: known code returns entry (case-insensitive)', () => {
    expect(findCountry('NZ')?.name).toBe('New Zealand');
    expect(findCountry('nz')?.name).toBe('New Zealand');
    expect(findCountry('US')?.name).toBe('United States');
  });

  it('findCountry: unknown / nullish returns undefined', () => {
    expect(findCountry('XX')).toBeUndefined();
    expect(findCountry(null)).toBeUndefined();
    expect(findCountry(undefined)).toBeUndefined();
    expect(findCountry('')).toBeUndefined();
  });

  it('WORLD_BBOX covers the whole web-mercator range', () => {
    const [w, s, e, n] = WORLD_BBOX;
    expect(w).toBe(-180);
    expect(e).toBe(180);
    expect(s).toBeLessThanOrEqual(-80);
    expect(n).toBeGreaterThanOrEqual(80);
  });
});
