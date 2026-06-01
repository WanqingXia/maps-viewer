import { describe, it, expect } from 'vitest';
import type { HostMessage, WebviewMessage, LayerInit } from '@maps-viewer/shared';
import { POST_MESSAGE_VERSION } from '@maps-viewer/shared';

describe('postMessage protocol', () => {
  it('init message has expected shape', () => {
    const layer: LayerInit = {
      layerId: 'l1',
      fileName: 'x.geojson',
      geojson: { type: 'FeatureCollection', features: [] },
      color: '#e6194b',
      strokeWidth: 3,
    };
    const msg: HostMessage = { type: 'init', mapboxToken: 'pk.x', layers: [layer], basemap: 'standard' };
    expect(msg.type).toBe('init');
    expect(msg.layers[0].layerId).toBe('l1');
  });

  it('setBasemap message accepts both basemaps', () => {
    const a: HostMessage = { type: 'setBasemap', basemap: 'standard' };
    const b: HostMessage = { type: 'setBasemap', basemap: 'satellite' };
    expect(a.basemap).toBe('standard');
    expect(b.basemap).toBe('satellite');
  });

  it('webview replies fit the discriminated union', () => {
    const ready: WebviewMessage = { type: 'ready' };
    const loaded: WebviewMessage = { type: 'mapLoaded' };
    const err: WebviewMessage = { type: 'error', message: 'boom', code: 'NO_MAPBOX' };
    expect(ready.type).toBe('ready');
    expect(loaded.type).toBe('mapLoaded');
    expect(err.message).toBe('boom');
  });

  it('exports a protocol version constant', () => {
    expect(POST_MESSAGE_VERSION).toBe(1);
  });
});
