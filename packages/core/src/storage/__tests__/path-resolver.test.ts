import { describe, it, expect } from 'vitest';
import {
  toProjectFileRef,
  resolveProjectFileRef,
  type WorkspaceFolderInfo,
} from '../path-resolver.js';

const ws: ReadonlyArray<WorkspaceFolderInfo> = [
  { name: 'maps-viewer', path: '/Users/me/code/maps-viewer' },
  { name: 'other-repo',  path: '/Users/me/code/other-repo' },
];

describe('toProjectFileRef', () => {
  it('emits workspaceRelative when path lives inside a workspace folder', () => {
    const ref = toProjectFileRef('layer-1', '/Users/me/code/maps-viewer/data/x.geojson', ws);
    expect(ref).toEqual({
      layerId: 'layer-1',
      path: 'data/x.geojson',
      pathKind: 'workspaceRelative',
      workspaceFolder: 'maps-viewer',
    });
  });

  it('emits absolute when path is outside any workspace folder', () => {
    const ref = toProjectFileRef('layer-1', '/tmp/x.geojson', ws);
    expect(ref).toEqual({
      layerId: 'layer-1',
      path: '/tmp/x.geojson',
      pathKind: 'absolute',
    });
  });

  it('emits absolute when no workspace is open', () => {
    const ref = toProjectFileRef('layer-1', '/Users/me/code/maps-viewer/data/x.geojson', []);
    expect(ref.pathKind).toBe('absolute');
  });
});

describe('resolveProjectFileRef', () => {
  it('round-trips absolute paths verbatim', () => {
    const out = resolveProjectFileRef(
      { layerId: 'l', path: '/tmp/x.geojson', pathKind: 'absolute' }, ws,
    );
    expect(out).toEqual({ absolute: '/tmp/x.geojson', method: 'as-stored' });
  });

  it('matches workspaceRelative when folder is open', () => {
    const out = resolveProjectFileRef(
      { layerId: 'l', path: 'data/x.geojson', pathKind: 'workspaceRelative', workspaceFolder: 'maps-viewer' },
      ws,
    );
    expect(out).toEqual({
      absolute: '/Users/me/code/maps-viewer/data/x.geojson',
      method: 'workspace-matched',
    });
  });

  it('falls back to first workspace when the named folder is missing', () => {
    const out = resolveProjectFileRef(
      { layerId: 'l', path: 'data/x.geojson', pathKind: 'workspaceRelative', workspaceFolder: 'gone' },
      ws,
    );
    expect(out.method).toBe('workspace-fallback');
    expect(out.absolute).toBe('/Users/me/code/maps-viewer/data/x.geojson');
  });

  it('returns the relative string verbatim when no workspace is open', () => {
    const out = resolveProjectFileRef(
      { layerId: 'l', path: 'data/x.geojson', pathKind: 'workspaceRelative', workspaceFolder: 'gone' },
      [],
    );
    expect(out.method).toBe('as-stored');
    expect(out.absolute).toBe('data/x.geojson');
  });
});
