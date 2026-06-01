import { describe, it, expect } from 'vitest';
import { PALETTE, AUTO_PALETTE, HOVER_COLOR } from '@maps-viewer/shared';

describe('PALETTE', () => {
  it('has 22 entries: 20 auto + white + black', () => {
    expect(PALETTE).toHaveLength(22);
  });

  it('has all unique entries', () => {
    const set = new Set(PALETTE.map((c) => c.toLowerCase()));
    expect(set.size).toBe(PALETTE.length);
  });

  it('puts white and black at positions 20 and 21', () => {
    expect(PALETTE[20]).toBe('#ffffff');
    expect(PALETTE[21]).toBe('#000000');
  });

  it('AUTO_PALETTE is the first 20 entries', () => {
    expect(AUTO_PALETTE).toHaveLength(20);
    expect(AUTO_PALETTE[0]).toBe('#e6194b');
    expect(AUTO_PALETTE[19]).toBe('#808080');
  });

  it('HOVER_COLOR matches PRD spec (#FFFF00)', () => {
    expect(HOVER_COLOR).toBe('#FFFF00');
  });
});
