import { describe, it, expect } from 'vitest';
import type {
  HostMessage,
  WebviewMessage,
  Layer,
  LayerState,
  UserAction,
} from '@maps-viewer/shared';
import { POST_MESSAGE_VERSION, EMPTY_LAYER_STATE } from '@maps-viewer/shared';

const sampleLayer: Layer = {
  id: 'layer-1',
  fileName: 'sample.geojson',
  displayName: 'Sample',
  sourcePath: 'file:///tmp/sample.geojson',
  color: '#e6194b',
  strokeWidth: 3,
  visible: true,
  groupId: null,
  featureCount: 1,
};

const sampleState: LayerState = { ...EMPTY_LAYER_STATE, layers: [sampleLayer] };

describe('HostMessage shapes', () => {
  it('init carries token, state, layerData, and basemap', () => {
    const msg: HostMessage = {
      type: 'init',
      mapboxToken: 'pk.test',
      state: sampleState,
      layerData: { 'layer-1': { type: 'FeatureCollection', features: [] } },
      basemap: 'standard',
    };
    expect(msg.type).toBe('init');
    expect(msg.state.layers).toHaveLength(1);
    expect(msg.basemap).toBe('standard');
  });

  it('applyAction carries an action and optional layerData', () => {
    const msg: HostMessage = {
      type: 'applyAction',
      action: { type: 'setLayerVisible', layerId: 'layer-1', visible: false },
    };
    expect(msg.type).toBe('applyAction');
    expect(msg.layerData).toBeUndefined();
  });

  it('setBasemap is a discrete narrow message', () => {
    const msg: HostMessage = { type: 'setBasemap', basemap: 'satellite' };
    expect(msg.basemap).toBe('satellite');
  });
});

describe('WebviewMessage shapes', () => {
  it('requestAction excludes addLayer at the type level', () => {
    const action: UserAction = { type: 'setLayerColor', layerId: 'layer-1', color: '#3cb44b' };
    const msg: WebviewMessage = { type: 'requestAction', action };
    expect(msg.type).toBe('requestAction');
    // @ts-expect-error addLayer is not in UserAction
    const bad: UserAction = { type: 'addLayer', layer: sampleLayer };
    void bad;
  });

  it('ready / mapLoaded / error are all valid variants', () => {
    const a: WebviewMessage = { type: 'ready' };
    const b: WebviewMessage = { type: 'mapLoaded' };
    const c: WebviewMessage = { type: 'error', message: 'oops', code: 'X' };
    const d: WebviewMessage = { type: 'openExternal', url: 'https://www.openstreetmap.org/' };
    expect(a.type).toBe('ready');
    expect(b.type).toBe('mapLoaded');
    expect(c.code).toBe('X');
    expect(d.url).toContain('openstreetmap');
  });
});

describe('protocol version', () => {
  it('exposes a numeric POST_MESSAGE_VERSION', () => {
    expect(typeof POST_MESSAGE_VERSION).toBe('number');
    expect(POST_MESSAGE_VERSION).toBeGreaterThanOrEqual(1);
  });
});
