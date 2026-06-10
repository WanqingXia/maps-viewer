import { describe, it, expect } from 'vitest';
import type { Layer, Group, LayerState, ColorHex } from '@maps-viewer/shared';
import { EMPTY_LAYER_STATE } from '@maps-viewer/shared';
import { reduce, applyActions, layersInGroup } from '../layer-state.js';

const RED: ColorHex = '#e6194b';
const GREEN: ColorHex = '#3cb44b';
const BLUE: ColorHex = '#4363d8';
const YELLOW: ColorHex = '#ebbd4d';

function makeLayer(overrides: Partial<Layer> & { id: string }): Layer {
  return {
    fileName: `${overrides.id}.geojson`,
    displayName: overrides.id,
    sourcePath: `file:///tmp/${overrides.id}.geojson`,
    color: RED,
    strokeWidth: 3,
    visible: true,
    groupId: null,
    featureCount: 1,
    ...overrides,
  };
}

function makeGroup(id: string, color: ColorHex = BLUE): Group {
  return { id, name: id, color, visible: true };
}

describe('reduce: addLayer', () => {
  it('appends a new layer', () => {
    const a = makeLayer({ id: 'A' });
    const next = reduce(EMPTY_LAYER_STATE, { type: 'addLayer', layer: a });
    expect(next.layers).toEqual([a]);
  });

  it('is a no-op when the id already exists', () => {
    const a = makeLayer({ id: 'A' });
    const s1 = reduce(EMPTY_LAYER_STATE, { type: 'addLayer', layer: a });
    const s2 = reduce(s1, { type: 'addLayer', layer: { ...a, color: GREEN } });
    expect(s2).toBe(s1);
    expect(s2.layers).toHaveLength(1);
    expect(s2.layers[0]!.color).toBe(RED);
  });
});

describe('reduce: removeLayer', () => {
  it('drops the layer with the matching id', () => {
    const a = makeLayer({ id: 'A' });
    const b = makeLayer({ id: 'B' });
    const s = applyActions(EMPTY_LAYER_STATE, [
      { type: 'addLayer', layer: a },
      { type: 'addLayer', layer: b },
    ]);
    const next = reduce(s, { type: 'removeLayer', layerId: 'A' });
    expect(next.layers.map((l) => l.id)).toEqual(['B']);
  });

  it('returns identity when the layer is absent', () => {
    const next = reduce(EMPTY_LAYER_STATE, { type: 'removeLayer', layerId: 'ghost' });
    expect(next).toBe(EMPTY_LAYER_STATE);
  });
});

describe('reduce: renameLayer', () => {
  it('updates displayName', () => {
    const a = makeLayer({ id: 'A' });
    const s = reduce(EMPTY_LAYER_STATE, { type: 'addLayer', layer: a });
    const next = reduce(s, { type: 'renameLayer', layerId: 'A', name: 'My Layer' });
    expect(next.layers[0]!.displayName).toBe('My Layer');
  });

  it('falls back to fileName when name is empty/whitespace', () => {
    const a = makeLayer({ id: 'A', fileName: 'regions.geojson', displayName: 'X' });
    const s = reduce(EMPTY_LAYER_STATE, { type: 'addLayer', layer: a });
    const next = reduce(s, { type: 'renameLayer', layerId: 'A', name: '   ' });
    expect(next.layers[0]!.displayName).toBe('regions.geojson');
  });
});

describe('reduce: setLayerColor / setLayerStrokeWidth / setLayerVisible', () => {
  it('updates a single layer color', () => {
    const a = makeLayer({ id: 'A' });
    const s = reduce(EMPTY_LAYER_STATE, { type: 'addLayer', layer: a });
    const next = reduce(s, { type: 'setLayerColor', layerId: 'A', color: GREEN });
    expect(next.layers[0]!.color).toBe(GREEN);
  });

  it('clamps stroke width to [0, 30]', () => {
    const a = makeLayer({ id: 'A' });
    const s = reduce(EMPTY_LAYER_STATE, { type: 'addLayer', layer: a });
    expect(reduce(s, { type: 'setLayerStrokeWidth', layerId: 'A', width: -5 }).layers[0]!.strokeWidth).toBe(0);
    expect(reduce(s, { type: 'setLayerStrokeWidth', layerId: 'A', width: 99 }).layers[0]!.strokeWidth).toBe(30);
    expect(reduce(s, { type: 'setLayerStrokeWidth', layerId: 'A', width: 7 }).layers[0]!.strokeWidth).toBe(7);
  });

  it('toggles visibility independently of group', () => {
    const a = makeLayer({ id: 'A', visible: true });
    const s = reduce(EMPTY_LAYER_STATE, { type: 'addLayer', layer: a });
    const next = reduce(s, { type: 'setLayerVisible', layerId: 'A', visible: false });
    expect(next.layers[0]!.visible).toBe(false);
  });
});

describe('reduce: createGroup / setGroupColor cascade', () => {
  it('createGroup cascades color to member layers', () => {
    const a = makeLayer({ id: 'A', color: RED });
    const b = makeLayer({ id: 'B', color: GREEN });
    const s = applyActions(EMPTY_LAYER_STATE, [
      { type: 'addLayer', layer: a },
      { type: 'addLayer', layer: b },
    ]);
    const g = makeGroup('g1', YELLOW);
    const next = reduce(s, { type: 'createGroup', group: g, layerIds: ['A', 'B'] });
    expect(next.groups).toHaveLength(1);
    expect(next.layers.every((l) => l.color === YELLOW && l.groupId === 'g1')).toBe(true);
  });

  it('setGroupColor cascades to all member layers', () => {
    const a = makeLayer({ id: 'A' });
    const b = makeLayer({ id: 'B' });
    const c = makeLayer({ id: 'C' });
    const g = makeGroup('g1', YELLOW);
    const s = applyActions(EMPTY_LAYER_STATE, [
      { type: 'addLayer', layer: a },
      { type: 'addLayer', layer: b },
      { type: 'addLayer', layer: c },
      { type: 'createGroup', group: g, layerIds: ['A', 'B'] },
    ]);
    const next = reduce(s, { type: 'setGroupColor', groupId: 'g1', color: BLUE });
    expect(next.groups[0]!.color).toBe(BLUE);
    expect(layersInGroup(next, 'g1').every((l) => l.color === BLUE)).toBe(true);
    // C is NOT in the group; its color should be unchanged
    expect(next.layers.find((l) => l.id === 'C')!.color).toBe(RED);
  });

  it('setGroupVisible cascades visibility to members', () => {
    const a = makeLayer({ id: 'A', visible: true });
    const b = makeLayer({ id: 'B', visible: true });
    const s = applyActions(EMPTY_LAYER_STATE, [
      { type: 'addLayer', layer: a },
      { type: 'addLayer', layer: b },
      { type: 'createGroup', group: makeGroup('g1'), layerIds: ['A', 'B'] },
    ]);
    const next = reduce(s, { type: 'setGroupVisible', groupId: 'g1', visible: false });
    expect(next.groups[0]!.visible).toBe(false);
    expect(layersInGroup(next, 'g1').every((l) => l.visible === false)).toBe(true);
  });
});

describe('reduce: setLayerColor on grouped layer does NOT update group', () => {
  it('per-layer color override breaks the cascade for that layer only', () => {
    const a = makeLayer({ id: 'A' });
    const b = makeLayer({ id: 'B' });
    const s = applyActions(EMPTY_LAYER_STATE, [
      { type: 'addLayer', layer: a },
      { type: 'addLayer', layer: b },
      { type: 'createGroup', group: makeGroup('g1', YELLOW), layerIds: ['A', 'B'] },
      { type: 'setLayerColor', layerId: 'A', color: BLUE },
    ]);
    expect(s.groups[0]!.color).toBe(YELLOW);
    expect(s.layers.find((l) => l.id === 'A')!.color).toBe(BLUE);
    expect(s.layers.find((l) => l.id === 'B')!.color).toBe(YELLOW);
  });
});

describe('reduce: deleteGroup unparents members', () => {
  it('removes the group and sets members groupId to null', () => {
    const s = applyActions(EMPTY_LAYER_STATE, [
      { type: 'addLayer', layer: makeLayer({ id: 'A' }) },
      { type: 'addLayer', layer: makeLayer({ id: 'B' }) },
      { type: 'createGroup', group: makeGroup('g1'), layerIds: ['A', 'B'] },
    ]);
    const next = reduce(s, { type: 'deleteGroup', groupId: 'g1' });
    expect(next.groups).toHaveLength(0);
    expect(next.layers.every((l) => l.groupId === null)).toBe(true);
  });

  it('restores supplied member colors when deleting a group', () => {
    const s = applyActions(EMPTY_LAYER_STATE, [
      { type: 'addLayer', layer: makeLayer({ id: 'A' }) },
      { type: 'addLayer', layer: makeLayer({ id: 'B' }) },
      { type: 'createGroup', group: makeGroup('g1', YELLOW), layerIds: ['A', 'B'] },
    ]);
    const next = reduce(s, {
      type: 'deleteGroup',
      groupId: 'g1',
      restoredColors: { A: BLUE, B: GREEN },
    });
    expect(next.layers.find((l) => l.id === 'A')!.color).toBe(BLUE);
    expect(next.layers.find((l) => l.id === 'B')!.color).toBe(GREEN);
    expect(next.layers.every((l) => l.groupId === null)).toBe(true);
  });
});

describe('reduce: addToGroup / removeFromGroup', () => {
  it('addToGroup attaches a layer and updates its color', () => {
    const a = makeLayer({ id: 'A', color: RED });
    const s = applyActions(EMPTY_LAYER_STATE, [
      { type: 'addLayer', layer: a },
      { type: 'createGroup', group: makeGroup('g1', YELLOW), layerIds: [] },
      { type: 'addToGroup', layerId: 'A', groupId: 'g1' },
    ]);
    expect(s.layers[0]!.groupId).toBe('g1');
    expect(s.layers[0]!.color).toBe(YELLOW);
  });

  it('addToGroup with non-existent group is a no-op', () => {
    const s = reduce(EMPTY_LAYER_STATE, { type: 'addLayer', layer: makeLayer({ id: 'A' }) });
    const next = reduce(s, { type: 'addToGroup', layerId: 'A', groupId: 'ghost' });
    expect(next).toBe(s);
  });

  it('removeFromGroup detaches a layer', () => {
    const s = applyActions(EMPTY_LAYER_STATE, [
      { type: 'addLayer', layer: makeLayer({ id: 'A' }) },
      { type: 'createGroup', group: makeGroup('g1'), layerIds: ['A'] },
      { type: 'removeFromGroup', layerId: 'A' },
    ]);
    expect(s.layers[0]!.groupId).toBeNull();
  });

  it('removeFromGroup can assign an ungrouped color', () => {
    const s = applyActions(EMPTY_LAYER_STATE, [
      { type: 'addLayer', layer: makeLayer({ id: 'A' }) },
      { type: 'createGroup', group: makeGroup('g1', YELLOW), layerIds: ['A'] },
      { type: 'removeFromGroup', layerId: 'A', color: GREEN },
    ]);
    expect(s.layers[0]!.groupId).toBeNull();
    expect(s.layers[0]!.color).toBe(GREEN);
  });
});

describe('reduce: moveLayer', () => {
  it('moves a layer into a group and applies the group color', () => {
    const s = applyActions(EMPTY_LAYER_STATE, [
      { type: 'addLayer', layer: makeLayer({ id: 'A', color: RED }) },
      { type: 'addLayer', layer: makeLayer({ id: 'B', color: GREEN }) },
      { type: 'createGroup', group: makeGroup('g1', YELLOW), layerIds: [] },
    ]);
    const next = reduce(s, {
      type: 'moveLayer',
      layerId: 'B',
      targetGroupId: 'g1',
      targetIndex: 0,
      color: BLUE,
    });
    expect(next.layers[0]!.id).toBe('B');
    expect(next.layers[0]!.groupId).toBe('g1');
    expect(next.layers[0]!.color).toBe(YELLOW);
  });

  it('moves a layer out of a group and applies the supplied color', () => {
    const s = applyActions(EMPTY_LAYER_STATE, [
      { type: 'addLayer', layer: makeLayer({ id: 'A', color: RED }) },
      { type: 'addLayer', layer: makeLayer({ id: 'B', color: GREEN }) },
      { type: 'createGroup', group: makeGroup('g1', YELLOW), layerIds: ['A'] },
    ]);
    const next = reduce(s, {
      type: 'moveLayer',
      layerId: 'A',
      targetGroupId: null,
      targetIndex: 1,
      color: BLUE,
    });
    expect(next.layers[1]!.id).toBe('A');
    expect(next.layers[1]!.groupId).toBeNull();
    expect(next.layers[1]!.color).toBe(BLUE);
  });
});

describe('reduce: immutability', () => {
  it('never mutates input state', () => {
    const a = makeLayer({ id: 'A' });
    const s1 = reduce(EMPTY_LAYER_STATE, { type: 'addLayer', layer: a });
    const snapshot = JSON.parse(JSON.stringify(s1));
    reduce(s1, { type: 'setLayerColor', layerId: 'A', color: GREEN });
    reduce(s1, { type: 'removeLayer', layerId: 'A' });
    reduce(s1, { type: 'createGroup', group: makeGroup('g1'), layerIds: ['A'] });
    expect(s1).toEqual(snapshot);
  });

  it('returns a new state object when the change is meaningful', () => {
    const a = makeLayer({ id: 'A' });
    const s1 = reduce(EMPTY_LAYER_STATE, { type: 'addLayer', layer: a });
    const s2 = reduce(s1, { type: 'setLayerColor', layerId: 'A', color: GREEN });
    expect(s2).not.toBe(s1);
    expect(s2.layers).not.toBe(s1.layers);
  });

  it('returns identity when the action would be a no-op', () => {
    const a = makeLayer({ id: 'A', color: RED });
    const s1 = reduce(EMPTY_LAYER_STATE, { type: 'addLayer', layer: a });
    const s2 = reduce(s1, { type: 'setLayerColor', layerId: 'A', color: RED });
    expect(s2).toBe(s1);
  });
});
