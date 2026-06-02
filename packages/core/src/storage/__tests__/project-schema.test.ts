import { describe, it, expect } from 'vitest';
import { parseMapsJson, isParseError, EMPTY_MAPS_JSON } from '../project-schema.js';

const validProject = {
  id: '01HM-EXAMPLE',
  name: 'Test',
  createdAt: '2026-05-29T14:55:00.000Z',
  updatedAt: '2026-05-29T14:55:00.000Z',
  files: [{ layerId: 'layer-1', path: '/abs/x.geojson', pathKind: 'absolute' }],
  layerState: {
    layers: [{
      id: 'layer-1',
      fileName: 'x.geojson',
      displayName: 'X',
      sourcePath: 'file:///abs/x.geojson',
      color: '#e6194b',
      strokeWidth: 3,
      visible: true,
      groupId: null,
      featureCount: 5,
    }],
    groups: [],
  },
  basemap: 'standard',
  camera: { center: [0, 0], zoom: 1, bearing: 0, pitch: 0 },
};

describe('parseMapsJson — happy path', () => {
  it('accepts an empty v1 document', () => {
    const out = parseMapsJson(JSON.stringify(EMPTY_MAPS_JSON));
    expect(out).toEqual({ version: 1, projects: [] });
  });

  it('accepts a v1 document with one valid project', () => {
    const out = parseMapsJson(JSON.stringify({ version: 1, projects: [validProject] }));
    expect(out.projects).toHaveLength(1);
    expect(out.projects[0]!.id).toBe('01HM-EXAMPLE');
  });
});

describe('parseMapsJson — rejects malformed input', () => {
  it('throws on missing version', () => {
    expect(() => parseMapsJson(JSON.stringify({ projects: [] }))).toThrow();
  });

  it('throws on unknown future version', () => {
    expect(() => parseMapsJson(JSON.stringify({ version: 99, projects: [] }))).toThrow();
  });

  it('throws on bad color literal', () => {
    const bad = JSON.parse(JSON.stringify({ version: 1, projects: [validProject] })) as { projects: Array<{ layerState: { layers: Array<{ color: string }> } }> };
    bad.projects[0]!.layerState.layers[0]!.color = 'red';
    expect(() => parseMapsJson(JSON.stringify(bad))).toThrow();
  });

  it('throws on bad camera tuple', () => {
    const bad = JSON.parse(JSON.stringify({ version: 1, projects: [validProject] })) as { projects: Array<{ camera: { center: number[] } }> };
    bad.projects[0]!.camera.center = [1, 2, 3];
    expect(() => parseMapsJson(JSON.stringify(bad))).toThrow();
  });

  it('throws on stroke width out of range', () => {
    const bad = JSON.parse(JSON.stringify({ version: 1, projects: [validProject] })) as { projects: Array<{ layerState: { layers: Array<{ strokeWidth: number }> } }> };
    bad.projects[0]!.layerState.layers[0]!.strokeWidth = 999;
    expect(() => parseMapsJson(JSON.stringify(bad))).toThrow();
  });

  it('isParseError narrows ZodError', () => {
    try { parseMapsJson('not json'); }
    catch (e) {
      // SyntaxError from JSON.parse — NOT a ZodError
      expect(isParseError(e)).toBe(false);
    }
    try { parseMapsJson(JSON.stringify({ version: 2 })); }
    catch (e) {
      expect(isParseError(e)).toBe(true);
    }
  });
});
