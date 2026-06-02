import { describe, it, expect } from 'vitest';
import { AUTO_PALETTE } from '@maps-viewer/shared';
import { assignColor } from '../assign-color.js';

describe('assignColor', () => {
  it('returns the first auto-palette entry for usedCount 0', () => {
    expect(assignColor(0)).toBe(AUTO_PALETTE[0]);
  });

  it('walks through the auto-palette in order for 0..19', () => {
    for (let i = 0; i < AUTO_PALETTE.length; i++) {
      expect(assignColor(i)).toBe(AUTO_PALETTE[i]);
    }
  });

  it('cycles back to index 0 at usedCount 20', () => {
    expect(assignColor(20)).toBe(AUTO_PALETTE[0]);
    expect(assignColor(21)).toBe(AUTO_PALETTE[1]);
  });

  it('never auto-returns white or black', () => {
    const reserved = new Set(['#ffffff', '#000000']);
    for (let i = 0; i < 1000; i++) {
      expect(reserved.has(assignColor(i))).toBe(false);
    }
  });

  it('handles negative input safely (treated as positive cycle)', () => {
    expect(assignColor(-1)).toBe(AUTO_PALETTE[AUTO_PALETTE.length - 1]);
    expect(assignColor(-20)).toBe(AUTO_PALETTE[0]);
  });
});
